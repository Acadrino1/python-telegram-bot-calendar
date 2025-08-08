#!/bin/bash

# API Testing Script for Appointment Scheduler
# This script tests the main API endpoints

API_URL="http://localhost:3000/api"
TOKEN=""

echo "🧪 Appointment Scheduler API Test Suite"
echo "========================================"
echo ""

# Function to print colored output
print_success() { echo -e "\033[32m✅ $1\033[0m"; }
print_error() { echo -e "\033[31m❌ $1\033[0m"; }
print_info() { echo -e "\033[33m📝 $1\033[0m"; }

# Test 1: Health Check
echo "1. Testing Health Check..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/health)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)
if [ "$HTTP_CODE" == "200" ]; then
    print_success "Health check passed"
else
    print_error "Health check failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test 2: Register User
echo "2. Testing User Registration..."
REGISTER_RESPONSE=$(curl -s -X POST $API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test'$(date +%s)'@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User",
    "phone": "+1234567890",
    "role": "client"
  }')

if echo "$REGISTER_RESPONSE" | grep -q "token"; then
    print_success "Registration successful"
    TOKEN=$(echo "$REGISTER_RESPONSE" | grep -oP '"token":"\K[^"]+')
    print_info "Token saved for authenticated requests"
else
    print_error "Registration failed"
    echo "$REGISTER_RESPONSE"
fi
echo ""

# Test 3: Login
echo "3. Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    print_success "Login successful"
    # Update token if login worked
    NEW_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -oP '"token":"\K[^"]+')
    if [ ! -z "$NEW_TOKEN" ]; then
        TOKEN=$NEW_TOKEN
    fi
else
    print_info "Login test skipped (user might not exist)"
fi
echo ""

# Test 4: Get Profile (Authenticated)
if [ ! -z "$TOKEN" ]; then
    echo "4. Testing Get Profile (Authenticated)..."
    PROFILE_RESPONSE=$(curl -s -w "\n%{http_code}" $API_URL/auth/me \
      -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$PROFILE_RESPONSE" | tail -n 1)
    
    if [ "$HTTP_CODE" == "200" ]; then
        print_success "Profile retrieved successfully"
    else
        print_error "Profile retrieval failed (HTTP $HTTP_CODE)"
    fi
else
    print_info "Skipping authenticated tests (no token)"
fi
echo ""

# Test 5: Get Services
if [ ! -z "$TOKEN" ]; then
    echo "5. Testing Get Services..."
    SERVICES_RESPONSE=$(curl -s -w "\n%{http_code}" $API_URL/services \
      -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$SERVICES_RESPONSE" | tail -n 1)
    
    if [ "$HTTP_CODE" == "200" ]; then
        print_success "Services retrieved successfully"
    else
        print_error "Services retrieval failed (HTTP $HTTP_CODE)"
    fi
fi
echo ""

# Test 6: Get Appointments
if [ ! -z "$TOKEN" ]; then
    echo "6. Testing Get Appointments..."
    APPOINTMENTS_RESPONSE=$(curl -s -w "\n%{http_code}" $API_URL/appointments \
      -H "Authorization: Bearer $TOKEN")
    HTTP_CODE=$(echo "$APPOINTMENTS_RESPONSE" | tail -n 1)
    
    if [ "$HTTP_CODE" == "200" ]; then
        print_success "Appointments retrieved successfully"
    else
        print_error "Appointments retrieval failed (HTTP $HTTP_CODE)"
    fi
fi
echo ""

# Summary
echo "========================================"
echo "📊 Test Summary"
echo "API Base URL: $API_URL"
if [ ! -z "$TOKEN" ]; then
    print_success "Authentication working"
    echo "Token (first 20 chars): ${TOKEN:0:20}..."
else
    print_error "Authentication not tested"
fi
echo ""
print_info "For more thorough testing, use Postman or similar API testing tool"
echo "Import the API documentation from README.md for complete endpoint list"