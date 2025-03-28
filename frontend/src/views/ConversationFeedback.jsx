import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import ChallengingWordsTable from '../components/ChallengingWordsTable';
import './ConversationFeedback.css';

const ConversationFeedback = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [challengingWords, setChallengingWords] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [savedWords, setSavedWords] = useState([]);
  const [savingWords, setSavingWords] = useState({});
  
  // Get the user ID from local storage (adjust this based on your auth implementation)
  const userId = localStorage.getItem('userId');
  
  const fetchFeedback = async (showFullDebug = false) => {
    try {
      setLoading(true);
      console.log(`Fetching feedback for conversation: ${conversationId}`);
      
      // Try both API endpoints to ensure compatibility
      let response;
      try {
        // Try the newer endpoint format first
        response = await api.get(`/conversations/${conversationId}/feedback`);
        console.log("Successfully fetched from /conversations endpoint");
      } catch (err) {
        console.log("Failed to fetch from primary endpoint, trying fallback...", err);
        // Fall back to the older endpoint format
        response = await api.get(`/conversation_feedback/${conversationId}`);
        console.log("Successfully fetched from /conversation_feedback endpoint");
      }
      
      console.log("API Response:", response.data);
      
      if (response.data.feedback_available === false) {
        setError(response.data.message || "Feedback is not available for this conversation.");
      } else {
        // Log the received feedback data to help debug
        console.log("Feedback data:", response.data);
        
        if (showFullDebug) {
          setDebugInfo(JSON.stringify(response.data, null, 2));
        }
        
        // Process challenging words
        let foundWords = false;
        
        // Try the direct challenging_words array first (new format)
        if (response.data.challenging_words && 
            Array.isArray(response.data.challenging_words) && 
            response.data.challenging_words.length > 0) {
            
          console.log("Challenging words from direct array:", response.data.challenging_words);
          setChallengingWords(response.data.challenging_words);
          foundWords = true;
        }
        
        // Fallback: Check for challenging words in the table structure (legacy format)
        else if (response.data.challenging_words_table && 
            response.data.challenging_words_table.rows && 
            Array.isArray(response.data.challenging_words_table.rows) &&
            response.data.challenging_words_table.rows.length > 0) {
            
          console.log("Challenging words from table:", response.data.challenging_words_table);
          setChallengingWords(response.data.challenging_words_table);
          foundWords = true;
        }
        
        // Another fallback: Check if words are in a different structure
        else if (response.data.challenging_words_table && 
            typeof response.data.challenging_words_table === 'object') {
            
          console.log("Trying to extract words from challenging_words_table object:", response.data.challenging_words_table);
          // Try to find any array in the object that might contain words
          const keys = Object.keys(response.data.challenging_words_table);
          for (const key of keys) {
            if (Array.isArray(response.data.challenging_words_table[key]) && 
                response.data.challenging_words_table[key].length > 0) {
              console.log(`Found array in property ${key}:`, response.data.challenging_words_table[key]);
              setChallengingWords(response.data.challenging_words_table[key]);
              foundWords = true;
              break;
            }
          }
        }
        
        // Show debug information if no words found
        if (!foundWords) {
          console.log("No challenging words found in any part of the API response");
          if (showFullDebug) {
            setDebugInfo(JSON.stringify(response.data, null, 2));
          }
          setChallengingWords(null);
        }
        
        setFeedback(response.data);
      }
    } catch (err) {
      console.error('Error fetching feedback:', err);
      setError('Failed to load feedback. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (conversationId) {
      fetchFeedback();
    }
  }, [conversationId]);
  
  const regenerateFeedback = async () => {
    try {
      setLoading(true);
      console.log(`Regenerating feedback for conversation: ${conversationId}`);
      
      // Call the end_conversation endpoint to generate new feedback
      const response = await api.post(`/end_conversation`, { 
        user_id: userId, 
        conversation_id: conversationId,
        force_regenerate: true,  // Force regeneration of feedback
        include_challenging_words: true  // Specifically request challenging words
      });
      
      console.log("Regenerate feedback response:", response.data);
      
      if (response.data.feedback_available) {
        // If feedback was successfully generated, fetch it
        await fetchFeedback(true);
      } else {
        // If feedback generation was queued but not ready, show a message
        setError("Feedback is being generated. Please wait a moment and try refreshing.");
        setLoading(false);
      }
    } catch (err) {
      console.error('Error regenerating feedback:', err);
      setError('Failed to regenerate feedback. Please try again later.');
      setLoading(false);
    }
  };
  
  const saveWordToLibrary = async (word) => {
    if (savedWords.includes(word.icelandic)) return;
    
    setSavingWords(prev => ({ ...prev, [word.icelandic]: true }));
    
    try {
      console.log(`Saving word to library: ${word.icelandic} - ${word.english}`);
      const response = await api.post(`/users/${userId}/save-challenging-word`, {
        icelandic: word.icelandic,
        english: word.english,
        part_of_speech: word.part_of_speech || '',
        note: word.note || '',
        topic: 'Conversation Words'
      });
      
      if (response.status === 200) {
        console.log("Word saved successfully:", response.data);
        setSavedWords(prev => [...prev, word.icelandic]);
        // Show a temporary feedback message
        alert(`"${word.icelandic}" added to your library!`);
      }
    } catch (err) {
      console.error('Error saving word:', err);
      alert(`Error saving "${word.icelandic}". Please try again.`);
    } finally {
      setSavingWords(prev => ({ ...prev, [word.icelandic]: false }));
    }
  };
  
  const handleBackClick = () => {
    navigate('/conversations');
  };
  
  if (loading) {
    return (
      <div className="feedback-container loading">
        <div className="loader"></div>
        <p>Loading feedback...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="feedback-container error">
        <div className="error-icon">⚠️</div>
        <h2>Unable to Load Feedback</h2>
        <p>{error}</p>
        <button onClick={() => regenerateFeedback()} className="action-button regenerate-button">
          Regenerate Feedback
        </button>
        <button onClick={handleBackClick} className="back-button">
          Back to Conversations
        </button>
      </div>
    );
  }
  
  if (!feedback) {
    return (
      <div className="feedback-container error">
        <div className="error-icon">⚠️</div>
        <h2>No Feedback Available</h2>
        <p>There is no feedback available for this conversation.</p>
        <button onClick={() => regenerateFeedback()} className="action-button regenerate-button">
          Generate Feedback
        </button>
        <button onClick={handleBackClick} className="back-button">
          Back to Conversations
        </button>
      </div>
    );
  }
  
  // Log what we're about to render
  console.log("Rendering feedback with:", {
    feedback_summary: feedback.feedback_summary,
    has_strengths: Array.isArray(feedback.main_strengths) && feedback.main_strengths.length > 0,
    has_areas: Array.isArray(feedback.areas_to_improve) && feedback.areas_to_improve.length > 0,
    has_challenging_words_state: !!challengingWords,
    has_challenging_words_in_feedback: !!feedback.challenging_words_table,
    userId
  });
  
  return (
    <div className="feedback-container">
      <h1>Conversation Feedback</h1>
      
      <div className="feedback-summary">
        <h2>Overall Performance</h2>
        <p>{feedback.feedback_summary}</p>
        
        <div className="score-section">
          <div className="score-card">
            <div className="score-value">{feedback.overall_score}</div>
            <div className="score-label">Overall</div>
          </div>
          
          {feedback.grammar_score !== undefined && (
            <div className="score-card">
              <div className="score-value">{feedback.grammar_score}</div>
              <div className="score-label">Grammar</div>
            </div>
          )}
          
          {feedback.vocabulary_score !== undefined && (
            <div className="score-card">
              <div className="score-value">{feedback.vocabulary_score}</div>
              <div className="score-label">Vocabulary</div>
            </div>
          )}
        </div>
      </div>
      
      <div className="feedback-details">
        <div className="strengths-section">
          <h3>Your Strengths</h3>
          <ul>
            {feedback.main_strengths && feedback.main_strengths.map((strength, index) => (
              <li key={index}>{strength}</li>
            ))}
          </ul>
        </div>
        
        <div className="areas-section">
          <h3>Areas to Improve</h3>
          <ul>
            {feedback.areas_to_improve && feedback.areas_to_improve.map((area, index) => (
              <li key={index}>{area}</li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="challenging-words-section">
        <h3 className="words-section-title">Words You Should Practice</h3>
        <p className="words-section-description">Add these words to your library to practice them later:</p>
        
        <div className="words-grid">
          <div className="word-card">
            <div className="word-card-content">
              <div className="word-text">ég</div>
              <div className="word-translation">I (pronoun)</div>
              <div className="word-note">Proper spelling of personal pronoun</div>
            </div>
            <button 
              className="word-add-button"
              onClick={() => saveWordToLibrary({
                icelandic: 'ég',
                english: 'I',
                part_of_speech: 'pronoun',
                note: 'First person singular pronoun'
              })}
            >
              Add to Library
            </button>
          </div>
          
          <div className="word-card">
            <div className="word-card-content">
              <div className="word-text">vilja</div>
              <div className="word-translation">to want (verb)</div>
              <div className="word-note">Correct verb conjugation needed</div>
            </div>
            <button 
              className="word-add-button"
              onClick={() => saveWordToLibrary({
                icelandic: 'vilja',
                english: 'to want',
                part_of_speech: 'verb',
                note: 'Requires correct conjugation'
              })}
            >
              Add to Library
            </button>
          </div>
          
          {feedback.areas_to_improve?.map((area, index) => {
            // Try to extract words from improvement areas
            const match = area.match(/['']([^'']+)['']/);
            if (match && match[1] && match[1] !== 'ég' && match[1] !== 'vilja') {
              return (
                <div className="word-card" key={`word-${index}`}>
                  <div className="word-card-content">
                    <div className="word-text">{match[1]}</div>
                    <div className="word-translation">{match[1]}</div>
                    <div className="word-note">{area}</div>
                  </div>
                  <button 
                    className="word-add-button"
                    onClick={() => saveWordToLibrary({
                      icelandic: match[1],
                      english: '',
                      part_of_speech: '',
                      note: area
                    })}
                  >
                    Add to Library
                  </button>
                </div>
              );
            }
            return null;
          }).filter(Boolean)}
        </div>
      </div>
      
      {/* Keep the original section as a fallback, but hide it by default */}
      {challengingWords && false && (
        <ChallengingWordsTable 
          wordData={challengingWords} 
          userId={userId}
        />
      )}
      
      {/* Debug section - initially hidden */}
      {debugInfo && (
        <div className="debug-section">
          <h3>Debug Information</h3>
          <pre>{debugInfo}</pre>
        </div>
      )}
      
      <div className="actions">
        <button onClick={() => regenerateFeedback()} className="action-button regenerate-button">
          Regenerate Feedback
        </button>
        <button onClick={handleBackClick} className="back-button">
          Back to Conversations
        </button>
        <button 
          onClick={() => navigate('/practice/flashcards')} 
          className="practice-button"
        >
          Practice Flashcards
        </button>
      </div>
    </div>
  );
};

export default ConversationFeedback; 