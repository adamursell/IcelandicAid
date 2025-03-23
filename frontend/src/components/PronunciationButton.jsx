import React, { useState } from 'react';
import axios from 'axios';
import './PronunciationButton.css';
import config from '../config';

const PronunciationButton = ({ text }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  const handlePronounce = async (e) => {
    if (e) e.stopPropagation(); // Prevent event bubbling
    
    if (!text) {
      console.error("No text provided to pronounce");
      setError("No text to pronounce");
      return;
    }
    
    try {
      console.log("Attempting to pronounce:", text);
      setIsPlaying(true);
      setError(null);
      
      // Extract just the main word/phrase (before any parentheses)
      const match = text.match(/^([^(]+)(?:\s*\(|$)/);
      const cleanText = match ? match[1].trim() : text;
      
      console.log("Requesting pronunciation for:", cleanText);
      
      try {
        const response = await axios.post(`${config.API_URL}/api/text-to-speech`, {
          text: cleanText
        });
        
        if (!response.data || !response.data.audio) {
          console.error("Invalid response format:", response);
          throw new Error("No audio data received from server");
        }
        
        // Create and play audio from base64 string
        const audioSrc = `data:audio/mp3;base64,${response.data.audio}`;
        const audio = new Audio(audioSrc);
        
        audio.onended = () => setIsPlaying(false);
        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setError("Failed to play audio");
          setIsPlaying(false);
        };
        
        await audio.play();
      } catch (axiosError) {
        // Handle Axios-specific errors with more detail
        if (axiosError.response) {
          // The server responded with a status code outside the 2xx range
          const serverError = axiosError.response.data?.error || 'Unknown server error';
          console.error(`Server error (${axiosError.response.status}):`, serverError);
          setError(`Server error: ${serverError}`);
        } else if (axiosError.request) {
          // The request was made but no response was received
          console.error("No response received:", axiosError.request);
          setError("No response from server. Check your internet connection.");
        } else {
          // Something happened in setting up the request
          console.error("Request setup error:", axiosError.message);
          setError(`Request error: ${axiosError.message}`);
        }
        setIsPlaying(false);
      }
    } catch (err) {
      console.error("Pronunciation error:", err);
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