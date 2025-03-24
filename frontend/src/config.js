// config.js - Simple configuration for different environments

const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';

// Development configuration
const devConfig = {
  API_URL: "http://localhost:5000"
};

// Production configuration
const prodConfig = {
  API_URL: "https://kennibackend.onrender.com"
};

// Select the appropriate config based on environment
const config = isDevelopment ? devConfig : prodConfig;

console.log('Using API URL:', config.API_URL);

export default config; 