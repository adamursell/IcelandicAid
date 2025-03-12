// Configuration for API URLs based on environment
let API_URL;

// Check if we're in production (deployed on Render)
if (process.env.NODE_ENV === 'production') {
  API_URL = 'https://kennibackend.onrender.com';
} else {
  // Use environment variable or fallback to localhost for development
  API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
}

console.log('Using API URL:', API_URL);

export default {
  API_URL
}; 