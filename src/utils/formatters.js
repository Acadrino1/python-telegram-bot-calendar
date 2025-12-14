
function formatDateTime(dateString, options = {}) {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  
  return date.toLocaleDateString('en-US', defaultOptions);
}

function formatDate(dateString, options = {}) {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  };
  
  return date.toLocaleDateString('en-US', defaultOptions);
}

function formatNumber(number) {
  if (typeof number !== 'number') return '0';
  return number.toLocaleString('en-US');
}

function formatPercentage(value, decimals = 1) {
  if (typeof value !== 'number') return '0%';
  return `${value.toFixed(decimals)}%`;
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDuration(milliseconds) {
  if (!milliseconds) return '0s';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTimeAgo(dateString) {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
  return `${Math.floor(diffInSeconds / 31536000)}y ago`;
}

function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  
  // Remove all non-numeric characters
  const cleaned = phoneNumber.toString().replace(/\D/g, '');
  
  // Check if it's a US number
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
  }
  
  // Check if it's a US number with country code
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return cleaned.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, '+$1 ($2) $3-$4');
  }
  
  // Return original if not a recognized format
  return phoneNumber;
}

function truncateText(text, maxLength = 50) {
  if (!text || typeof text !== 'string') return '';
  
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength - 3) + '...';
}

function formatCurrency(amount, currency = 'USD') {
  if (typeof amount !== 'number') return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

function formatStatus(status) {
  if (!status) return '';
  
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getStatusColor(status) {
  const colorMap = {
    'pending': 'warning',
    'approved': 'success',
    'denied': 'danger',
    'active': 'success',
    'inactive': 'secondary',
    'scheduled': 'info',
    'confirmed': 'primary',
    'completed': 'success',
    'cancelled': 'danger',
    'no_show': 'warning'
  };
  
  return colorMap[status] || 'secondary';
}

function formatUserRole(role) {
  const roleMap = {
    'admin': 'Administrator',
    'provider': 'Provider',
    'client': 'Client'
  };
  
  return roleMap[role] || formatStatus(role);
}

function getRoleColor(role) {
  const colorMap = {
    'admin': 'danger',
    'provider': 'primary',
    'client': 'info'
  };
  
  return colorMap[role] || 'secondary';
}

function formatRegistrationSource(source) {
  const sourceMap = {
    'web': 'Web Registration',
    'telegram': 'Telegram Bot',
    'referral': 'Referral Link',
    'admin': 'Admin Created'
  };
  
  return sourceMap[source] || formatStatus(source);
}

function getSourceColor(source) {
  const colorMap = {
    'web': 'info',
    'telegram': 'primary',
    'referral': 'success',
    'admin': 'warning'
  };
  
  return colorMap[source] || 'secondary';
}

function formatArray(array, maxItems = 3) {
  if (!Array.isArray(array) || array.length === 0) return '';
  
  if (array.length <= maxItems) {
    return array.join(', ');
  }
  
  const displayed = array.slice(0, maxItems);
  const remaining = array.length - maxItems;
  
  return `${displayed.join(', ')} and ${remaining} more`;
}

function getInitials(firstName, lastName) {
  const first = firstName ? firstName.charAt(0).toUpperCase() : '';
  const last = lastName ? lastName.charAt(0).toUpperCase() : '';
  return `${first}${last}`;
}

function formatFileSize(bytes) {
  return formatBytes(bytes);
}

function capitalize(text) {
  if (!text || typeof text !== 'string') return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  
  return colors[Math.abs(hash) % colors.length];
}

function formatValidationErrors(errors) {
  if (!errors || typeof errors !== 'object') return [];
  
  return Object.entries(errors).map(([field, messages]) => ({
    field: formatStatus(field),
    messages: Array.isArray(messages) ? messages : [messages]
  }));
}

function safeJsonParse(jsonString, fallback = {}) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return fallback;
  }
}

function highlightSearch(text, searchTerm) {
  if (!text || !searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

module.exports = {
  formatDateTime,
  formatDate,
  formatNumber,
  formatPercentage,
  formatBytes,
  formatDuration,
  formatTimeAgo,
  formatPhoneNumber,
  truncateText,
  formatCurrency,
  formatStatus,
  getStatusColor,
  formatUserRole,
  getRoleColor,
  formatRegistrationSource,
  getSourceColor,
  formatArray,
  getInitials,
  formatFileSize,
  capitalize,
  stringToColor,
  formatValidationErrors,
  safeJsonParse,
  highlightSearch
};