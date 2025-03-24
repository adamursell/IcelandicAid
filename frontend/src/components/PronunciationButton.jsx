import React, { useState } from 'react';
import axios from 'axios';
import config from '../config';

// Super simplified version to avoid any syntax errors
const PronunciationButton = ({ text }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  const handlePronounce = async (e) => {
    if (e) e.stopPropagation();
    
    if (!text) {
      setError("No text to pronounce");
      return;
    }
    
    try {
      setIsPlaying(true);
      setError(null);
      
      // Extract just the main word
      const cleanText = text.split('(')[0].trim();
      
      // API call
      const response = await axios.post(
        `${config.API_URL}/api/text-to-speech`, 
        { text: cleanText }
      );
      
      if (response.data && response.data.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${response.data.audio}`);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
          setError("Failed to play audio");
          setIsPlaying(false);
        };
        await audio.play();
      } else {
        throw new Error("No audio received");
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to get pronunciation");
      setIsPlaying(false);
    }
  };

  return (
    <div>
      <button 
        onClick={handlePronounce}
        disabled={isPlaying}
        style={{ background: '#4285f4', color: 'white', borderRadius: '20px', padding: '8px 15px' }}
      >
        {isPlaying ? '🔊 Playing...' : '🔊 Pronounce'}
      </button>
      {error && <div style={{ color: 'red', fontSize: '12px' }}>{error}</div>}
    </div>
  );
};

export default PronunciationButton; 