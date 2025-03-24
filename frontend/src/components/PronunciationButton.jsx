import React, { useState } from 'react';
import axios from 'axios';
import './PronunciationButton.css';
import config from '../config';

const PronunciationButton = ({ text }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  // Add debug logging when component mounts
  console.log(`PronunciationButton rendered for text: "${text}"`);

  const handlePronounce = async (e) => {
    if (e) e.stopPropagation(); // Prevent event bubbling
    
    console.log("============================================");
    console.log("Pronunciation button clicked");
    console.log("Text to pronounce:", text || "No text provided");
    console.log("API URL from config:", config.API_URL);
    console.log("============================================");
    
    if (!text) {
      console.error("No text provided to pronounce");
      setError("No text to pronounce");
      return;
    }
    
    try {
      console.log("Starting pronunciation request process");
      setIsPlaying(true);
      setError(null);
      
      // Extract just the main word/phrase (before any parentheses)
      const match = text.match(/^([^(]+)(?:\s*\(|$)/);
      const cleanText = match ? match[1].trim() : text;
      
      console.log("Cleaned text for pronunciation:", cleanText);
      
      // Log request details before making the request
      console.log("Preparing axios request to:", `${config.API_URL}/api/text-to-speech`);
      console.log("Request payload:", { text: cleanText });
      
      try {
        console.log("Sending text-to-speech API request...");
        
        // Make the request with more detailed error capturing
        const response = await axios.post(`${config.API_URL}/api/text-to-speech`, {
          text: cleanText
        }, {
          timeout: 15000, // 15 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        console.log("API response received:", {
          status: response.status,
          hasData: !!response.data,
          hasAudio: !!(response.data && response.data.audio),
          dataKeys: response.data ? Object.keys(response.data) : []
        });
        
        if (!response.data || !response.data.audio) {
          console.error("Invalid response format:", response.data);
          throw new Error("No audio data received from server");
        }
        
        // Log audio data size for debugging (first 50 chars)
        const audioDataPreview = response.data.audio.substring(0, 50) + "...";
        console.log("Audio data received (preview):", audioDataPreview);
        
        // Create and play audio from base64 string
        console.log("Creating audio element");
        const audioSrc = `data:audio/mp3;base64,${response.data.audio}`;
        const audio = new Audio(audioSrc);
        
        // Set up event handlers before playing
        audio.onplay = () => console.log("Audio playback started");
        audio.onended = () => {
          console.log("Audio playback completed");
          setIsPlaying(false);
        };
        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setError("Failed to play audio");
          setIsPlaying(false);
        };
        
        console.log("Attempting to play audio...");
        await audio.play();
        console.log("Audio play() method called successfully");
        
      } catch (axiosError) {
        // Handle Axios-specific errors with more detail
        console.error("Axios error details:", {
          message: axiosError.message,
          hasResponse: !!axiosError.response,
          hasRequest: !!axiosError.request,
          code: axiosError.code,
          stack: axiosError.stack
        });
        
        if (axiosError.response) {
          // The server responded with a status code outside the 2xx range
          const serverError = axiosError.response.data?.error || 'Unknown server error';
          console.error(`Server error (${axiosError.response.status}):`, serverError);
          console.error("Full error response:", axiosError.response.data);
          setError(`Server error (${axiosError.response.status}): ${serverError}`);
        } else if (axiosError.request) {
          // The request was made but no response was received
          console.error("No response received:", axiosError.request);
          setError("No response from server. Check your internet connection or server status.");
        } else {
          // Something happened in setting up the request
          console.error("Request setup error:", axiosError.message);
          setError(`Request error: ${axiosError.message}`);
        }
        setIsPlaying(false);
      }
    } catch (err) {
      console.error("Unexpected error in pronunciation handler:", err);
      console.error("Error stack:", err.stack);
      setError(err.message || "Failed to get pronunciation");
      setIsPlaying(false);
    }
  };

  return (
    <div className="pronunciation-container" onClick={(e) => e.stopPropagation()}>
      <button 
        className="pronunciation-button"
        onClick={handlePronounce}
        disabled={isPlaying}
        style={{
          backgroundColor: isPlaying ? '#34a853' : '#4285f4',
          color: 'white',
          border: 'none',
          borderRadius: '20px',
          padding: '8px 15px',
          margin: '10px',
          fontSize: '14px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px'
        }}
      >
        {isPlaying ? '🔊 Playing...' : '🔊 Pronounce'}
      </button>
      {error && (
        <div style={{ color: 'red', fontSize: '12px', marginTop: '5px' }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default PronunciationButton; 