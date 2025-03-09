import React, { useState } from 'react';
import axios from 'axios';
import HomeButton from './HomeButton';

// Typing indicator component with animated dots
const TypingIndicator = () => {
  return (
    <div className="typing-indicator">
      <span className="dot"></span>
      <span className="dot"></span>
      <span className="dot"></span>
    </div>
  );
};

const FeedbackPane = ({ feedback }) => {
  return (
    <div className="feedback-pane-fixed">
      <h3>Feedback</h3>
      
      {!feedback ? (
        <p className="no-feedback-message">Feedback will appear here after you send a message.</p>
      ) : (
        <>
          {feedback.grammar_notes && feedback.grammar_notes.length > 0 && (
            <div className="feedback-section">
              <h4>Grammar Notes:</h4>
              <ul>
                {feedback.grammar_notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          
          {feedback.vocabulary_suggestions && Object.keys(feedback.vocabulary_suggestions).length > 0 && (
            <div className="feedback-section">
              <h4>Vocabulary Suggestions:</h4>
              <ul>
                {Object.entries(feedback.vocabulary_suggestions).map(([word, suggestion], index) => (
                  <li key={index}>
                    <strong>{word}</strong>: {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {feedback.overall_feedback && (
            <div className="feedback-section">
              <h4>Overall Feedback:</h4>
              <p>{feedback.overall_feedback}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// New component for the feedback overlay
const FeedbackOverlay = ({ feedback, onClose }) => {
  if (!feedback) return null;
  
  // Ensure all required fields exist with fallbacks
  const feedbackSummary = feedback.feedback_summary || "No summary available.";
  const mainStrengths = Array.isArray(feedback.main_strengths) ? feedback.main_strengths : [];
  const areasToImprove = Array.isArray(feedback.areas_to_improve) ? feedback.areas_to_improve : [];
  const overallScore = typeof feedback.overall_score === 'number' ? feedback.overall_score : 5; // Default to 5 if not available
  
  // Calculate the score percentage for the progress bar
  const scorePercentage = (overallScore / 10) * 100;
  
  // Function to safely render text that might contain special characters
  const safeRender = (text) => {
    if (typeof text !== 'string') return '';
    
    try {
      // First check if the text might be a stringified JSON that needs parsing
      if (text.startsWith('{') && text.endsWith('}')) {
        try {
          const parsed = JSON.parse(text);
          return typeof parsed === 'string' ? parsed.replace(/"/g, '') : String(parsed);
        } catch (e) {
          // If parsing fails, continue with normal text processing
          console.log('Failed to parse potential JSON string:', e);
        }
      }
      
      // Handle newlines that might be in the text
      return text.replace(/\\n/g, '\n').replace(/"/g, '');
    } catch (e) {
      console.error('Error in safeRender:', e);
      return String(text);
    }
  };
  
  return (
    <div className="feedback-overlay">
      <div className="feedback-modal">
        <button className="close-button" onClick={onClose}>×</button>
        <h2>Conversation Feedback</h2>
        
        <div className="feedback-summary">
          <h3>Summary</h3>
          <p>{safeRender(feedbackSummary)}</p>
        </div>
        
        <div className="feedback-strengths">
          <h3>Main Strengths</h3>
          {mainStrengths.length > 0 ? (
            <ul>
              {mainStrengths.map((strength, index) => (
                <li key={index}>{safeRender(strength)}</li>
              ))}
            </ul>
          ) : (
            <p>No specific strengths identified.</p>
          )}
        </div>
        
        <div className="feedback-improvements">
          <h3>Areas to Improve</h3>
          {areasToImprove.length > 0 ? (
            <ul>
              {areasToImprove.map((area, index) => (
                <li key={index}>{safeRender(area)}</li>
              ))}
            </ul>
          ) : (
            <p>No specific areas for improvement identified.</p>
          )}
        </div>
        
        <div className="overall-score">
          <h3>Overall Score: {overallScore}/10</h3>
          <div className="score-bar-container">
            <div 
              className="score-bar" 
              style={{ width: `${scorePercentage}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConversationalPractice = ({ userId }) => {
  const [scenario, setScenario] = useState('');
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [feedbackHistory, setFeedbackHistory] = useState({});
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [isConversationEnded, setIsConversationEnded] = useState(false);
  const [overallFeedback, setOverallFeedback] = useState(null);
  const [showFeedbackOverlay, setShowFeedbackOverlay] = useState(false);
  const [translationHistory, setTranslationHistory] = useState({});
  const [showTranslation, setShowTranslation] = useState({});

  const handleStartConversation = async () => {
    if (!scenario.trim()) return;
    
    setIsLoading(true);
    setIsTyping(true);
    setError(null);
    try {
      const response = await axios.post('http://localhost:5000/start_conversation', {
        user_id: userId,
        scenario: scenario
      });
      
      const assistantMessageIndex = 0; // First message index
      setMessages([{ role: 'assistant', content: response.data.message }]);
      
      // Store English translation if available
      if (response.data.english_translation) {
        setTranslationHistory(prev => ({
          ...prev,
          [assistantMessageIndex]: response.data.english_translation
        }));
      }
      
      setIsStarted(true);
      setConversationId(response.data.conversation_id);
    } catch (err) {
      console.error('Failed to start conversation:', err);
      setError(err.response?.data?.error || 'Failed to start conversation');
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;
    
    setIsLoading(true);
    setIsTyping(true);
    setError(null);
    
    // Add user message immediately for better UX
    const newUserMessage = { role: 'user', content: userInput };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setUserInput('');
    
    try {
      const response = await axios.post('http://localhost:5000/chat', {
        user_id: userId,
        conversation_id: conversationId,
        message: newUserMessage.content
      });
      
      console.log("Chat response:", response.data);
      
      // Add the assistant's response
      const assistantResponse = response.data.response;
      const newAssistantMessage = { 
        role: 'assistant', 
        content: assistantResponse.icelandic_text 
      };
      
      setMessages(prevMessages => [...prevMessages, newAssistantMessage]);
      
      // Store the feedback for the user's message
      const newFeedbackHistory = { ...feedbackHistory };
      newFeedbackHistory[messages.length] = {
        grammar_notes: assistantResponse.grammar_notes || [],
        vocabulary_suggestions: assistantResponse.vocabulary_suggestions || {},
        overall_feedback: assistantResponse.overall_feedback || ''
      };
      setFeedbackHistory(newFeedbackHistory);
      
      // Store the translation for the assistant's message
      const newTranslationHistory = { ...translationHistory };
      newTranslationHistory[messages.length + 1] = assistantResponse.english_translation || '';
      setTranslationHistory(newTranslationHistory);
      
      // Check if the conversation is complete
      if (response.data.is_complete) {
        setIsConversationEnded(true);
        
        // Wait a moment for the feedback to be generated
        setTimeout(async () => {
          try {
            // Fetch the feedback
            const feedbackResponse = await axios.get(`http://localhost:5000/conversations/${conversationId}/feedback`);
            
            if (feedbackResponse.data && feedbackResponse.data.feedback_summary) {
              setOverallFeedback(feedbackResponse.data);
              setShowFeedbackOverlay(true);
            }
          } catch (err) {
            console.error('Failed to fetch feedback after conversation completion:', err);
          }
        }, 2000); // Wait 2 seconds before fetching feedback
      }
      
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err.response?.data?.error || 'Failed to send message');
      
      // Remove the user message if the request failed
      setMessages(prevMessages => prevMessages.slice(0, -1));
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleEndConversation = async () => {
    if (!conversationId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log("Ending conversation with ID:", conversationId);
      
      const response = await axios.post('http://localhost:5000/end_conversation', {
        user_id: userId,
        conversation_id: conversationId
      });
      
      console.log("End conversation response:", response.data);
      
      // Set the conversation as ended
      setIsConversationEnded(true);
      
      // If we received feedback, store it and show the overlay
      if (response.data && response.data.feedback_summary) {
        // Log the feedback data for debugging
        console.log("Received feedback data:", JSON.stringify(response.data));
        
        setOverallFeedback(response.data);
        setShowFeedbackOverlay(true);
      } else {
        console.error('Missing feedback data in response:', response.data);
        setError('Received incomplete feedback data. Please try again.');
      }
      
    } catch (err) {
      console.error('Failed to end conversation:', err);
      
      // Log more detailed error information
      if (err.response) {
        console.error('Error response data:', err.response.data);
        console.error('Error response status:', err.response.status);
        console.error('Error response headers:', err.response.headers);
      } else if (err.request) {
        console.error('Error request:', err.request);
      } else {
        console.error('Error message:', err.message);
      }
      
      // Set a more descriptive error message
      if (err.response?.data?.error && err.response.data.error.includes('feedback_summary')) {
        setError('Error parsing feedback data. Please try again.');
      } else {
        setError(err.response?.data?.error || 'Failed to end conversation');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewFeedbackSummary = async () => {
    // If we already have the feedback, just show the overlay
    if (overallFeedback) {
      setShowFeedbackOverlay(true);
      return;
    }
    
    // Otherwise, fetch it from the server
    setIsLoading(true);
    setIsFeedbackLoading(true);
    setError(null);
    
    try {
      console.log("Fetching feedback for conversation ID:", conversationId);
      
      // Add a timeout to prevent hanging if the server doesn't respond
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out')), 30000)
      );
      
      const fetchPromise = axios.get(`http://localhost:5000/conversations/${conversationId}/feedback`);
      
      // Race between the fetch and the timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      console.log("Feedback response:", response.data);
      
      if (response.data) {
        // Log the feedback data for debugging
        console.log("Received feedback data:", JSON.stringify(response.data));
        
        // Validate the response data has the expected structure
        if (response.data.feedback_summary) {
          setOverallFeedback(response.data);
          setShowFeedbackOverlay(true);
        } else if (response.data.error && response.data.error.includes("JSON")) {
          // Handle JSON parsing errors specifically
          console.error("JSON parsing error:", response.data.error);
          setError("There was an issue processing the feedback. The system is working to fix this. Please try again in a moment.");
          
          // Automatically retry after a short delay
          setTimeout(() => {
            console.log("Retrying feedback fetch...");
            handleViewFeedbackSummary();
          }, 3000);
        } else {
          console.error("Invalid feedback data structure:", response.data);
          setError("Received invalid feedback data. Please try again.");
        }
      } else {
        setError("No feedback available for this conversation");
      }
    } catch (err) {
      console.error('Failed to fetch feedback:', err);
      
      // Log more detailed error information
      if (err.response) {
        console.error('Error response data:', err.response.data);
        console.error('Error response status:', err.response.status);
        console.error('Error response headers:', err.response.headers);
      } else if (err.request) {
        console.error('Error request:', err.request);
      } else {
        console.error('Error message:', err.message);
      }
      
      if (err.message === 'Request timed out') {
        setError("Request timed out. The feedback generation is taking longer than expected. Please try again in a moment.");
      } else if (err.response?.data?.error && err.response.data.error.includes('feedback_summary')) {
        setError("Error parsing feedback data. Please try again.");
      } else {
        const errorMessage = err.response?.data?.error || 'Failed to fetch feedback';
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
      setIsFeedbackLoading(false);
    }
  };

  const handleCloseFeedbackOverlay = () => {
    setShowFeedbackOverlay(false);
  };

  const handleMessageClick = (index) => {
    // Only user messages have feedback
    if (messages[index].role === 'user') {
      setSelectedMessageIndex(index);
      setFeedback(feedbackHistory[index]);
    }
  };

  const handleTranslationToggle = (index) => {
    if (messages[index].role === 'assistant' && translationHistory[index]) {
      setShowTranslation(prev => ({
        ...prev,
        [index]: !prev[index]
      }));
    }
  };

  return (
    <div className="container">
      <HomeButton />
      <h2>Conversational Practice</h2>
      
      {error && (
        <div style={{ color: 'red', margin: '10px 0' }}>
          {error}
        </div>
      )}
      
      {!isStarted ? (
        <div className="scenario-setup">
          <h3>Set up your conversation</h3>
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder="Describe the scenario for your conversation..."
            rows="4"
            style={{ width: '100%', marginBottom: '20px' }}
          />
          <button 
            onClick={handleStartConversation}
            disabled={isLoading || !scenario.trim()}
          >
            {isLoading ? 'Starting...' : 'Start Conversation'}
          </button>
        </div>
      ) : (
        <div className="conversation-with-feedback">
          <div className="chat-container">
            <div className="messages" style={{ 
              height: '400px', 
              overflowY: 'auto', 
              border: '1px solid #ccc',
              padding: '20px',
              marginBottom: '20px'
            }}>
              {messages.map((msg, index) => (
                <div key={index}>
                  <div 
                    className={`message ${msg.role} ${msg.role === 'user' && selectedMessageIndex === index ? 'selected' : ''}`}
                    style={{
                      marginBottom: msg.role === 'assistant' && showTranslation[index] ? '5px' : '10px',
                      textAlign: msg.role === 'user' ? 'right' : 'left',
                      color: msg.role === 'user' ? '#5DADE2' : '#2C3E50',
                      cursor: (msg.role === 'user' && feedbackHistory[index]) || 
                             (msg.role === 'assistant' && translationHistory[index]) ? 'pointer' : 'default',
                      position: 'relative'
                    }}
                    onClick={() => {
                      if (msg.role === 'user') {
                        handleMessageClick(index);
                      } else if (msg.role === 'assistant') {
                        handleTranslationToggle(index);
                      }
                    }}
                  >
                    {msg.content}
                    {msg.role === 'user' && feedbackHistory[index] && (
                      <span 
                        className="feedback-indicator" 
                        title="Click to view feedback"
                      >
                        💬
                      </span>
                    )}
                    {msg.role === 'assistant' && translationHistory[index] && (
                      <span 
                        className="translation-indicator" 
                        title="Click to view English translation"
                        style={{
                          position: 'absolute',
                          right: '5px',
                          bottom: '5px',
                          fontSize: '12px',
                          color: '#5DADE2'
                        }}
                      >
                        🔤
                      </span>
                    )}
                  </div>
                  
                  {msg.role === 'assistant' && showTranslation[index] && (
                    <div 
                      className="translation-box"
                      style={{
                        backgroundColor: '#f8f9fa',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        marginBottom: '10px',
                        marginLeft: '20px',
                        fontSize: '0.9em',
                        position: 'relative'
                      }}
                    >
                      <div style={{ marginRight: '20px' }}>
                        {translationHistory[index]}
                      </div>
                      <button
                        onClick={() => handleTranslationToggle(index)}
                        style={{
                          position: 'absolute',
                          top: '5px',
                          right: '5px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '2px',
                          color: '#999'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
              
              {/* System message when conversation is complete */}
              {isConversationEnded && (
                <div className="message system">
                  The conversation has ended, click below to generate an overall feedback summary
                </div>
              )}
              
              {/* Typing indicator */}
              {isTyping && (
                <div className="message assistant">
                  <TypingIndicator />
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              {isConversationEnded ? (
                <button 
                  onClick={handleViewFeedbackSummary}
                  disabled={isLoading || isFeedbackLoading}
                  className="view-feedback-btn"
                  style={{ flex: 1 }}
                >
                  {isFeedbackLoading ? 'Generating Feedback...' : 'View Conversation Feedback Summary'}
                </button>
              ) : (
                <>
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Type your message..."
                    style={{ flex: 1 }}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={isLoading}
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={isLoading || !userInput.trim()}
                  >
                    {isLoading ? 'Sending...' : 'Send'}
                  </button>
                  
                  {/* End Conversation Button */}
                  <button 
                    onClick={handleEndConversation}
                    disabled={isLoading}
                    className="end-conversation-btn"
                  >
                    End Conversation
                  </button>
                </>
              )}
            </div>
          </div>
          
          <FeedbackPane feedback={feedback} />
          
          {/* Feedback Overlay */}
          {showFeedbackOverlay && (
            <FeedbackOverlay 
              feedback={overallFeedback} 
              onClose={handleCloseFeedbackOverlay} 
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ConversationalPractice; 