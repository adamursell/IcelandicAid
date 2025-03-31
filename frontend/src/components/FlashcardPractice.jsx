import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const FlashcardPractice = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    console.log("FlashcardPractice component - redirecting to practice session with spaced repetition mode");
    
    // Redirect to the practice session with spaced repetition mode
    // Add timestamp to ensure we get a fresh session and avoid caching issues
    navigate('/practice/session', { 
      state: {
        topic: 'all',
        practiceMode: 'spaced',
        quantity: null, // Not used for spaced repetition
        timestamp: Date.now() // Add timestamp to ensure a fresh session
      }
    });
  }, [navigate]);
  
  // This will only show briefly before the redirect
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Flashcard Practice</h1>
      <p>Redirecting to spaced repetition practice...</p>
      <div className="loader"></div>
    </div>
  );
};

export default FlashcardPractice; 