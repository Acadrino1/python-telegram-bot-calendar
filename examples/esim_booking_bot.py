"""Class-based eSIM booking bot example using python-telegram-bot-calendar."""
from dataclasses import dataclass, field
from datetime import date, datetime, time
import os, uuid
from typing import Callable, Dict, List, Optional, Tuple
import telebot
from telebot.types import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
from telegram_bot_calendar import DetailedTelegramCalendar, LSTEP
TIME_SLOTS: List[time] = [time(hour=8), time(hour=10), time(hour=12), time(hour=14), time(hour=16)]
CATEGORIES = ["New registration", "Mobile SIM activation", "Technical support"]
@dataclass
class Address:
    suite: Optional[str] = None
    street_number: str = ""
    street_name: str = ""
    city: str = ""
    province: str = ""
    postal_code: str = ""
@dataclass
class Identity:
    first_name: str = ""
    middle_name: Optional[str] = None
    last_name: str = ""
    date_of_birth: date = date.today()
    drivers_license: Optional[str] = None
    license_issue: Optional[date] = None
    license_expiry: Optional[date] = None
@dataclass
class BookingRequest:
    user_id: int
    category: str
    appointment_date: date
    time_slot: time
    identity: Identity
    address: Address
    status: str = "pending_user"
    booking_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    @property
    def display_time(self) -> str: return self.time_slot.strftime("%I:%M %p")
    @property
    def display_date(self) -> str: return self.appointment_date.strftime("%d %B %Y")
    def summary(self) -> str:
        optional = [
            f"Driver's License: {self.identity.drivers_license}" if self.identity.drivers_license else None,
            f"License Issue Date: {self.identity.license_issue.strftime('%d/%m/%Y')}" if self.identity.license_issue else None,
            f"License Expiry Date: {self.identity.license_expiry.strftime('%d/%m/%Y')}" if self.identity.license_expiry else None,
        ]
        lines = [
            f"Booking ID: {self.booking_id}",
            f"Category: {self.category}",
            f"Date: {self.display_date}",
            f"Time: {self.display_time}",
            "Name: " f"{self.identity.first_name} "
            f"{(self.identity.middle_name + ' ') if self.identity.middle_name else ''}"
            f"{self.identity.last_name}",
            f"Date of Birth: {self.identity.date_of_birth.strftime('%d/%m/%Y')}",
            *[item for item in optional if item],
            f"Suite/Unit: {self.address.suite or 'N/A'}",
            f"Street: {self.address.street_number} {self.address.street_name}",
            f"City: {self.address.city}",
            f"Province: {self.address.province}",
            f"Postal Code: {self.address.postal_code}",
            f"Status: {self.status}",
        ]
        return "\n".join(lines)
class EsimBookingBot:
    def __init__(self, token: str, admin_chat_id: Optional[int] = None) -> None:
        self.bot = telebot.TeleBot(token)
        self.admin_chat_id = admin_chat_id
        self.requests: Dict[str, BookingRequest] = {}
        self.user_requests: Dict[int, List[str]] = {}
        self.booked_slots: Dict[date, Dict[time, str]] = {}
        self.in_progress: Dict[int, Dict[str, object]] = {}
        self.calendar_id = 8
        self.form_fields: List[Tuple[str, str, Callable[[str], Tuple[bool, object, Optional[str]]]]] = [
            ("first_name", "Enter your first name:", self._parse_required_text),
            ("middle_name", "Enter your middle name (leave blank if none):", self._parse_optional_text),
            ("last_name", "Enter your last name:", self._parse_required_text),
            ("dob", "Enter your date of birth [DD/MM/YYYY]:", self._parse_required_date),
            ("license", "Driver's license number (optional, leave blank if none):", self._parse_optional_text),
            ("license_issue", "License issue date [DD/MM/YYYY] (optional):", self._parse_optional_date),
            ("license_expiry", "License expiry date [DD/MM/YYYY] (optional):", self._parse_optional_date),
            ("suite", "Suite or unit number (leave blank if none):", self._parse_optional_text),
            ("street_number", "Street number:", self._parse_required_text), ("street_name", "Street name:", self._parse_required_text),
            ("city", "City:", self._parse_required_text), ("province", "Province:", self._parse_required_text),
            ("postal", "Postal code (format A2A 1B4):", self._parse_postal_code),
        ]
        self._register_handlers()
    def _register_handlers(self) -> None:
        @self.bot.message_handler(commands=["start"])
        def start(message): self._reset_progress(message.chat.id); self._send_main_menu(message.chat.id)
        @self.bot.message_handler(func=lambda m: m.text == "Create a booking")
        def begin_booking(message): self._start_booking_flow(message.chat.id)
        @self.bot.message_handler(func=lambda m: m.text == "My bookings")
        def list_bookings(message): self._send_user_bookings(message.chat.id)
        @self.bot.message_handler(func=lambda m: m.text == "FAQ / TOS")
        def faq(message):
            info = (
                "eSIM support bookings run between 8:00 AM and 6:00 PM Eastern. Slots last 30-60 minutes and are reserved "
                "for one client at a time. By booking, you agree to our disclaimer and Terms of Service."
            )
            self.bot.send_message(message.chat.id, info)
        @self.bot.message_handler(func=lambda m: True, content_types=["text"])
        def text_flow(message): self._route_message(message)
        calendar_func = DetailedTelegramCalendar.func(calendar_id=self.calendar_id)
        @self.bot.callback_query_handler(func=calendar_func)
        def handle_calendar(call): self._handle_calendar_selection(call)
        @self.bot.callback_query_handler(func=lambda c: c.data.startswith("slot:"))
        def handle_time_slot(call): self._handle_time_selection(call)
        @self.bot.callback_query_handler(func=lambda c: c.data.startswith("confirm:"))
        def handle_confirmation(call): self._finalize_booking(call)
        @self.bot.callback_query_handler(func=lambda c: c.data.startswith("cancel:"))
        def handle_cancel(call): self._cancel_booking(call)
        @self.bot.callback_query_handler(func=lambda c: c.data.startswith("admin:"))
        def handle_admin(call): self._admin_decision(call)
    def _start_booking_flow(self, user_id: int) -> None:
        self.in_progress[user_id] = {"stage": "category"}
        markup = ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
        for category in CATEGORIES: markup.add(KeyboardButton(category))
        self.bot.send_message(user_id, "Select the type of appointment:", reply_markup=markup)
    def _reset_progress(self, user_id: int) -> None: self.in_progress.pop(user_id, None)
    def _get_progress(self, user_id: int) -> Optional[Dict[str, object]]: return self.in_progress.get(user_id)
    def _route_message(self, message) -> None:
        progress = self._get_progress(message.chat.id)
        if not progress:
            self.bot.send_message(message.chat.id, "Use the menu to begin a booking or view FAQs.")
            return
        if progress.get("stage") == "category": self._handle_category(message)
        elif progress.get("stage") == "fields": self._handle_form_field(message)
        else: self.bot.send_message(message.chat.id, "Please follow the prompts in order.")
    def _handle_category(self, message) -> None:
        if message.text not in CATEGORIES:
            self.bot.send_message(message.chat.id, "Please select one of the listed categories.")
            return
        progress = self._get_progress(message.chat.id)
        progress["category"] = message.text
        progress["stage"] = "calendar"
        calendar, step = DetailedTelegramCalendar(calendar_id=self.calendar_id).build()
        self.bot.send_message(message.chat.id, f"Select {LSTEP[step]}", reply_markup=calendar)
    def _handle_calendar_selection(self, call) -> None:
        result, key, step = DetailedTelegramCalendar(calendar_id=self.calendar_id).process(call.data)
        if not result and key:
            self.bot.edit_message_text(f"Select {LSTEP[step]}", call.message.chat.id, call.message.message_id, reply_markup=key)
            return
        if not result: return
        progress = self._get_progress(call.message.chat.id)
        if not progress: return
        progress["date"] = result; progress["stage"] = "time"
        self.bot.edit_message_text(
            f"Chosen date: {result.strftime('%d %B %Y')}\nSelect a time slot:", call.message.chat.id, call.message.message_id, reply_markup=self._time_slots_markup(result)
        )
    def _time_slots_markup(self, chosen_date: date) -> InlineKeyboardMarkup:
        markup = InlineKeyboardMarkup(row_width=1)
        for slot in self._available_slots(chosen_date):
            label = slot.strftime("%I:%M %p Eastern")
            markup.add(InlineKeyboardButton(label, callback_data=f"slot:{chosen_date.isoformat()}:{slot.isoformat()}"))
        if not markup.keyboard: markup.add(InlineKeyboardButton("No slots available. Pick another date.", callback_data="slot:none"))
        return markup
    def _handle_time_selection(self, call) -> None:
        if call.data == "slot:none":
            self.bot.answer_callback_query(call.id, "No slots for that date. Choose another.")
            return
        _, day, slot_raw = call.data.split(":")
        chosen_date = datetime.fromisoformat(day).date(); slot_time = time.fromisoformat(slot_raw)
        if slot_time not in self._available_slots(chosen_date):
            self.bot.answer_callback_query(call.id, "Slot already booked. Please choose another.")
            self.bot.edit_message_reply_markup(call.message.chat.id, call.message.message_id, reply_markup=self._time_slots_markup(chosen_date))
            return
        progress = self._get_progress(call.message.chat.id)
        if not progress: return
        progress.update({"time": slot_time, "stage": "fields", "field_index": 0})
        self.bot.answer_callback_query(call.id, "Time slot selected.")
        self.bot.send_message(call.message.chat.id, self.form_fields[0][1])
    def _handle_form_field(self, message) -> None:
        progress = self._get_progress(message.chat.id)
        index = int(progress.get("field_index", 0))
        key, prompt, parser = self.form_fields[index]
        valid, value, error = parser(message.text)
        if not valid:
            self.bot.send_message(message.chat.id, error or prompt)
            return
        progress[key] = value; index += 1
        if index >= len(self.form_fields): self._prompt_confirmation(message.chat.id); return
        progress["field_index"] = index
        self.bot.send_message(message.chat.id, self.form_fields[index][1])
    def _prompt_confirmation(self, chat_id: int) -> None:
        progress = self._get_progress(chat_id)
        if not progress: return
        identity = Identity(first_name=progress.get("first_name", ""), middle_name=progress.get("middle_name"), last_name=progress.get("last_name", ""), date_of_birth=progress.get("dob", date.today()), drivers_license=progress.get("license"), license_issue=progress.get("license_issue"), license_expiry=progress.get("license_expiry"))
        address = Address(suite=progress.get("suite"), street_number=progress.get("street_number", ""), street_name=progress.get("street_name", ""), city=progress.get("city", ""), province=progress.get("province", ""), postal_code=progress.get("postal", ""))
        request = BookingRequest(user_id=chat_id, category=progress.get("category", ""), appointment_date=progress.get("date"), time_slot=progress.get("time"), identity=identity, address=address)
        progress["preview"] = request
        markup = InlineKeyboardMarkup()
        markup.add(InlineKeyboardButton("Confirm", callback_data=f"confirm:{request.booking_id}"))
        markup.add(InlineKeyboardButton("Cancel", callback_data=f"cancel:{request.booking_id}"))
        self.bot.send_message(chat_id, request.summary() + "\n\nConfirm or cancel?", reply_markup=markup)
    def _finalize_booking(self, call) -> None:
        booking_id = call.data.split(":", maxsplit=1)[1]
        progress = self._get_progress(call.message.chat.id)
        request: BookingRequest = progress.get("preview") if progress else None
        if not request or request.booking_id != booking_id:
            self.bot.answer_callback_query(call.id, "Booking preview not found.")
            return
        if request.time_slot not in self._available_slots(request.appointment_date):
            self.bot.answer_callback_query(call.id, "Slot already taken. Choose another time.")
            progress.update({"stage": "time"})
            self.bot.send_message(call.message.chat.id, "Select a new time:", reply_markup=self._time_slots_markup(request.appointment_date))
            return
        request.status = "pending_admin"
        self._save_request(request)
        self.bot.edit_message_text("Booking submitted. The administrator will confirm your request.", call.message.chat.id, call.message.message_id)
        self._notify_admin(request)
    def _notify_admin(self, request: BookingRequest) -> None:
        if not self.admin_chat_id: return
        markup = InlineKeyboardMarkup()
        markup.add(InlineKeyboardButton("Accept", callback_data=f"admin:accept:{request.booking_id}"), InlineKeyboardButton("Deny", callback_data=f"admin:deny:{request.booking_id}"))
        self.bot.send_message(self.admin_chat_id, f"New booking request:\n{request.summary()}", reply_markup=markup)
    def _cancel_booking(self, call) -> None:
        booking_id = call.data.split(":", maxsplit=1)[1]
        canceled = self._cancel_request(booking_id)
        self.bot.edit_message_text("Booking canceled." if canceled else "Nothing to cancel.", call.message.chat.id, call.message.message_id)
    def _admin_decision(self, call) -> None:
        _, decision, booking_id = call.data.split(":")
        request = self.requests.get(booking_id)
        if not request:
            self.bot.answer_callback_query(call.id, "Booking not found.")
            return
        request.status = "accepted" if decision == "accept" else "denied"
        self.bot.edit_message_text(f"Booking {decision}ed:\n{request.summary()}", call.message.chat.id, call.message.message_id)
        self.bot.send_message(request.user_id, f"Your booking has been {decision}ed.\n{request.summary()}")
    def _send_user_bookings(self, user_id: int) -> None:
        ids = self.user_requests.get(user_id, [])
        if not ids:
            self.bot.send_message(user_id, "No bookings yet. Tap 'Create a booking' to start.")
            return
        lines = []
        markup = InlineKeyboardMarkup(row_width=1)
        for booking_id in ids:
            request = self.requests.get(booking_id)
            if not request: continue
            lines.append(f"{request.display_date} at {request.display_time} - {request.category} ({request.status})")
            markup.add(InlineKeyboardButton(f"Cancel {request.display_date} {request.display_time}", callback_data=f"cancel:{booking_id}"))
        self.bot.send_message(user_id, "\n".join(lines), reply_markup=markup)
    def _available_slots(self, chosen_date: date) -> List[time]:
        booked_for_day = self.booked_slots.get(chosen_date, {})
        return [slot for slot in TIME_SLOTS if slot not in booked_for_day]
    def _save_request(self, request: BookingRequest) -> None:
        self.requests[request.booking_id] = request
        self.user_requests.setdefault(request.user_id, []).append(request.booking_id)
        self.booked_slots.setdefault(request.appointment_date, {})[request.time_slot] = request.booking_id
        self._reset_progress(request.user_id)
    def _cancel_request(self, booking_id: str) -> Optional[BookingRequest]:
        request = self.requests.pop(booking_id, None)
        if not request: return None
        self.booked_slots.get(request.appointment_date, {}).pop(request.time_slot, None)
        user_list = self.user_requests.get(request.user_id, [])
        if booking_id in user_list: user_list.remove(booking_id)
        return request
    def _parse_required_text(self, raw: str) -> Tuple[bool, object, Optional[str]]:
        cleaned = raw.strip(); return (bool(cleaned), cleaned, "This field is required.")
    def _parse_optional_text(self, raw: str) -> Tuple[bool, object, Optional[str]]:
        cleaned = raw.strip(); return True, (cleaned or None), None
    def _parse_required_date(self, raw: str) -> Tuple[bool, object, Optional[str]]:
        try: return True, datetime.strptime(raw.strip(), "%d/%m/%Y").date(), None
        except ValueError: return False, None, "Invalid format. Use DD/MM/YYYY."
    def _parse_optional_date(self, raw: str) -> Tuple[bool, object, Optional[str]]:
        cleaned = raw.strip()
        if not cleaned: return True, None, None
        try: return True, datetime.strptime(cleaned, "%d/%m/%Y").date(), None
        except ValueError: return False, None, "Invalid format. Use DD/MM/YYYY."
    def _parse_postal_code(self, raw: str) -> Tuple[bool, object, Optional[str]]:
        cleaned = raw.strip().upper()
        valid = len(cleaned) == 7 and cleaned[3] == " " and cleaned.replace(" ", "").isalnum()
        return (valid, cleaned if valid else None, "Please use the format A2A 1B4.")
    def run(self) -> None: self.bot.infinity_polling()
def main() -> None:
    token = os.environ.get("TELEGRAM_TOKEN")
    if not token: raise RuntimeError("Set TELEGRAM_TOKEN to run the bot.")
    admin_id_env = os.environ.get("ADMIN_CHAT_ID")
    admin_id = int(admin_id_env) if admin_id_env else None
    EsimBookingBot(token, admin_id).run()
if __name__ == "__main__":
    main()
