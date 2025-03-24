// config.js - Configuration for different environments

const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';

// Development configuration (local machine)
const devConfig = {
  API_URL: "http://localhost:5000"
};

// What might the backend be called?
// Try different possible backend URLs for Render
const possibleBackendUrls = [
  "https://kennibackend.onrender.com",  // Primary name (correct one)
  "https://kenni-backend.onrender.com", // With hyphen
  "https://icelandicaid-backend.onrender.com",
  "https://icelandicaid.onrender.com"
];

// Production configuration (Render deployment)
const prodConfig = {
  // Use primary backend URL directly
  API_URL: "https://kennibackend.onrender.com"  // This is the correct URL
};

// Export the appropriate configuration based on environment
const config = isDevelopment ? devConfig : prodConfig;

// If this is production, add some logging for troubleshooting
if (!isDevelopment) {
  // Logging info for troubleshooting
  console.log('Frontend URL:', window.location.origin);
  console.log('Using backend URL:', config.API_URL);
  
  // For additional debugging, log alternate versions
  if (window.location.origin.includes('render.com')) {
    const frontendUrl = window.location.origin;
    console.log('Frontend URL on Render:', frontendUrl);
    
    // Create mappings from frontend to possible backend URLs for debugging
    const backendMappings = {
      'kennifrontend.onrender.com': 'kennibackend.onrender.com',
      'kenni-frontend.onrender.com': 'kennibackend.onrender.com'
    };
    
    // Log what the mapped URL would be (for debugging)
    for (const [frontendDomain, backendDomain] of Object.entries(backendMappings)) {
      if (frontendUrl.includes(frontendDomain)) {
        const mappedUrl = frontendUrl.replace(frontendDomain, backendDomain);
        console.log('Mapped URL would be:', mappedUrl);
        break;
      }
    }
  }
}

console.log('Final API URL:', config.API_URL);

export default config; 