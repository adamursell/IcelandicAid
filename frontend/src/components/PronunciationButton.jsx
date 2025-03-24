import React, { useState } from 'react';
import axios from 'axios';
import './PronunciationButton.css';
import config from '../config';

const PronunciationButton = ({ text }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  const handlePronounce = async (e) => {
    if (e) {
      e.stopPropagation();
    }
    
    console.log("Pronunciation button clicked for:", text);
    
    if (!text) {
      console.error("No text provided to pronounce");
      setError("No text to pronounce");
      return;
    }
    
    try {
      setIsPlaying(true);
      setError(null);
      
      // Extract just the main word/phrase (before any parentheses)
      const match = text.match(/^([^(]+)(?:\s*\(|$)/);
      const cleanText = match ? match[1].trim() : text;
      
      console.log("Requesting pronunciation for:", cleanText);
      console.log("API URL:", config.API_URL);
      
      const response = await axios.post(`${config.API_URL}/api/text-to-speech`, {
        text: cleanText
      });
      
      if (!response.data || !response.data.audio) {
        throw new Error("No audio data received");
      }
      
      // Create and play audio from base64 string
      const audioSrc = `data:audio/mp3;base64,${response.data.audio}`;
      const audio = new Audio(audioSrc);
      
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setError("Failed to play audio");
        setIsPlaying(false);
      };
      
      await audio.play();
    } catch (err) {
      console.error("Pronunciation error:", err);
      
      let errorMessage = "Failed to get pronunciation";
      if (err.response) {
        errorMessage = `Server error: ${err.response.status}`;
      } else if (err.request) {
        errorMessage = "No response from server";
      }
      
      setError(errorMessage);
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