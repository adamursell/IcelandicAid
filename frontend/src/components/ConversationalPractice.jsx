import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import config from '../config';
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
  const grammarScore = typeof feedback.grammar_score === 'number' ? feedback.grammar_score : null;
  const vocabularyScore = typeof feedback.vocabulary_score === 'number' ? feedback.vocabulary_score : null;
  
  // Calculate the score percentages for the progress bars
  const overallScorePercentage = (overallScore / 10) * 100;
  const grammarScorePercentage = grammarScore !== null ? (grammarScore / 10) * 100 : null;
  const vocabularyScorePercentage = vocabularyScore !== null ? (vocabularyScore / 10) * 100 : null;
  
  // Function to get color based on score (heatmap from red to green)
  const getScoreColor = (score) => {
    // Score from 1-10
    if (score <= 3) return '#e74c3c'; // Red for low scores
    if (score <= 5) return '#f39c12'; // Orange/Yellow for medium-low scores
    if (score <= 7) return '#f1c40f'; // Yellow for medium scores
    if (score <= 9) return '#2ecc71'; // Light green for good scores
    return '#27ae60'; // Dark green for excellent scores
  };
  
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
        
        <div className="score-section">
          <div className="score-row">
            {grammarScore !== null && (
              <div className="grammar-score">
                <h3>Grammatical Accuracy: {grammarScore}/10</h3>
                <div className="score-bar-container">
                  <div 
                    className="score-bar grammar-bar" 
                    style={{ width: `${grammarScorePercentage}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {vocabularyScore !== null && (
              <div className="vocabulary-score">
                <h3>Vocabulary Usage: {vocabularyScore}/10</h3>
                <div className="score-bar-container">
                  <div 
                    className="score-bar vocabulary-bar" 
                    style={{ width: `${vocabularyScorePercentage}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
          
          <div className="overall-score">
            <h3 className="overall-grade-header">Overall grade: {overallScore}/10</h3>
            <div className="score-bar-container">
              <div 
                className="score-bar" 
                style={{ 
                  width: `${overallScorePercentage}%`,
                  backgroundColor: getScoreColor(overallScore)
                }}
              ></div>
            </div>
          </div>
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
      </div>
    </div>
  );
};

const ConversationalPractice = ({ userId }) => {
  const [conversationId, setConversationId] = useState(null);
  const [scenario, setScenario] = useState('');
  const [messages, setMessages] = useState([]);
  const [userMessage, setUserMessage] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [isConversationEnded, setIsConversationEnded] = useState(false);
  const [overallFeedback, setOverallFeedback] = useState(null);
  const [showFeedbackOverlay, setShowFeedbackOverlay] = useState(false);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [feedbackHistory, setFeedbackHistory] = useState({});
  const [translationHistory, setTranslationHistory] = useState({});
  const [showTranslation, setShowTranslation] = useState({});
  const [feedbackAvailable, setFeedbackAvailable] = useState(false);
  const [hasUserResponded, setHasUserResponded] = useState(false);

  // Add a useEffect to ensure feedbackAvailable is set when conversation ends
  useEffect(() => {
    if (isConversationEnded) {
      console.log("Conversation ended, ensuring feedback button is available");
      setFeedbackAvailable(true);
    }
  }, [isConversationEnded]);

  // Reset feedback when a new conversation starts
  useEffect(() => {
    if (isStarted && messages.length > 0) {
      // Reset feedback when conversation starts
      setSelectedMessageIndex(null);
      setFeedback(null);
    }
  }, [isStarted, messages.length]);

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (action === 'start' && scenario.trim()) {
        handleStartConversation();
      } else if (action === 'send' && userMessage.trim() && !isLoading && !isTyping) {
        handleSendMessage();
      }
    }
  };

  const handleStartConversation = async () => {
    if (!scenario.trim()) return;
    
    setIsLoading(true);
    setIsTyping(true);
    setError(null);
    setHasUserResponded(false);
    
    try {
      const response = await axios.post(`${config.API_URL}/start_conversation`, {
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
    if (!userMessage.trim() || isLoading) return;
    
    setIsLoading(true);
    setIsTyping(true);
    setError(null);
    
    // Add user message immediately for better UX
    const newUserMessage = { role: 'user', content: userMessage };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setUserMessage('');
    
    // Set hasUserResponded to true when the user sends their first message
    setHasUserResponded(true);
    
    try {
      const response = await axios.post(`${config.API_URL}/chat`, {
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
      
      // Automatically update the feedback pane to show the latest message's feedback
      setSelectedMessageIndex(messages.length);
      setFeedback(newFeedbackHistory[messages.length]);
      
      // Store the translation for the assistant's message
      const newTranslationHistory = { ...translationHistory };
      newTranslationHistory[messages.length + 1] = assistantResponse.english_translation || '';
      setTranslationHistory(newTranslationHistory);
      
      // Check if the conversation is complete
      if (response.data.is_complete) {
        console.log("Conversation completed by agent");
        setIsConversationEnded(true);
        // Set feedbackAvailable to true so the button appears
        setFeedbackAvailable(true);
        console.log("Set feedbackAvailable to true");
        
        // Wait a moment for the feedback to be generated
        setTimeout(async () => {
          try {
            // Fetch the feedback
            const feedbackResponse = await axios.get(`${config.API_URL}/conversations/${conversationId}/feedback`);
            
            if (feedbackResponse.data && feedbackResponse.data.feedback_summary) {
              setOverallFeedback(feedbackResponse.data);
              setShowFeedbackOverlay(true);
            } else {
              console.log('Feedback not immediately available after conversation completion by agent');
              // Make sure feedbackAvailable is set to true so the button appears
              setFeedbackAvailable(true);
            }
          } catch (err) {
            console.error('Failed to fetch feedback after conversation completion:', err);
            // Ensure the button is still shown even if there's an error
            setFeedbackAvailable(true);
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
      
      const response = await axios.post(`${config.API_URL}/end_conversation`, {
        user_id: userId,
        conversation_id: conversationId
      });
      
      console.log("End conversation response:", response.data);
      
      // Set the conversation as ended
      setIsConversationEnded(true);
      
      // Check if feedback is available immediately
      if (response.data && response.data.feedback_available) {
        // If feedback is available, show the button to view it
        setFeedbackAvailable(true);
      } else {
        console.log('Feedback not immediately available, will need to fetch it separately');
        // Still set feedback available to true so the button appears
        setFeedbackAvailable(true);
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
      
      setError(err.response?.data?.error || 'Failed to end conversation');
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
      
      const fetchPromise = axios.get(`${config.API_URL}/conversations/${conversationId}/feedback`);
      
      // Race between the fetch and the timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      console.log("Feedback response:", response.data);
      
      if (response.data) {
        // Check if we have actual feedback data
        if (response.data.feedback_summary) {
          console.log("Received feedback data:", JSON.stringify(response.data));
          setOverallFeedback(response.data);
          setShowFeedbackOverlay(true);
        } else if (response.data.message && !response.data.feedback_available) {
          // If feedback is not available but we have a message
          console.log("Feedback not available:", response.data.message);
          setError(response.data.message);
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

  const handleStartNewConversation = () => {
    // Reset all the necessary state variables
    setIsStarted(false);
    setIsConversationEnded(false);
    setMessages([]);
    setUserMessage('');
    setScenario('');
    setConversationId(null);
    setOverallFeedback(null);
    setFeedbackAvailable(false);
    setFeedbackHistory({});
    setTranslationHistory({});
    setShowTranslation({});
    setSelectedMessageIndex(null);
    setFeedback(null);
    setHasUserResponded(false);
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
    <div className="conversational-practice-container">
      <style jsx>{`
        .conversational-practice-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .message-list {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          margin-bottom: 20px;
          background-color: white;
          border-radius: 8px;
          box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.1);
        }
        
        .message {
          margin-bottom: 15px;
          padding: 10px 15px;
          border-radius: 18px;
          max-width: 80%;
          word-wrap: break-word;
        }
        
        .user-message {
          align-self: flex-end;
          background-color: #dcf8c6;
          margin-left: auto;
        }
        
        .assistant-message {
          align-self: flex-start;
          background-color: #f0f0f0;
        }
        
        .message-input-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .message-input {
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          resize: none;
          height: 80px;
          font-family: inherit;
          width: 100%;
          box-sizing: border-box;
        }
        
        .button-container {
          display: flex;
          gap: 10px;
          width: 100%;
        }
        
        .send-button, .end-conversation-btn, .view-feedback-btn {
          padding: 10px 15px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: bold;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          box-sizing: border-box;
        }
        
        .send-button {
          background-color: #4caf50;
          color: white;
        }
        
        .end-conversation-btn {
          background-color: #f44336;
          color: white;
        }
        
        .view-feedback-btn {
          background-color: #2196f3;
          color: white;
          padding: 12px 20px;
          font-size: 16px;
          margin-top: 10px;
        }
        
        .conversation-ended-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
          background-color: #f9f9f9;
          border-radius: 8px;
          text-align: center;
          width: 100%;
        }
        
        .conversation-ended-message {
          font-size: 18px;
          margin-bottom: 15px;
          color: #555;
        }
        
        .typing-indicator {
          display: flex;
          padding: 10px;
          margin-bottom: 15px;
        }
        
        .typing-dot {
          width: 8px;
          height: 8px;
          margin: 0 2px;
          background-color: #999;
          border-radius: 50%;
          animation: typing-animation 1.4s infinite ease-in-out;
        }
        
        @keyframes typing-animation {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        
        .typing-dot:nth-child(1) { animation-delay: 0s; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        
        .error-message {
          color: #f44336;
          margin-top: 10px;
          text-align: center;
        }
        
        /* Add this to prevent any animations */
        .fa-redo, .fa-sync-alt, .fa-plus {
          animation: none !important;
          transform: none !important;
          transition: none !important;
        }
        
        /* More specific rule to prevent icon spinning */
        .start-new-conversation-btn .fas,
        .start-new-conversation-btn i {
          animation: none !important;
          transform: none !important;
          transition: none !important;
        }
        
        /* Prevent hover effects on Font Awesome icons */
        button:hover .fas,
        button:hover i {
          animation: none !important;
          transform: none !important;
          transition: none !important;
        }
      `}</style>
      
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
          <input
            type="text"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder="Describe a scenario for conversation practice..."
            disabled={isLoading}
            onKeyDown={(e) => handleKeyPress(e, 'start')}
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
                  The conversation has ended, click below to view some overall feedback on the conversation
                </div>
              )}
              
              {/* Typing indicator */}
              {isTyping && (
                <div className="message assistant">
                  <TypingIndicator />
                </div>
              )}
            </div>
            
            <div className="message-input-container">
              {isConversationEnded ? (
                <div className="conversation-ended-container" style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  width: '100%'
                }}>
                  <p className="conversation-ended-message" style={{
                    textAlign: 'center',
                    width: '100%',
                    margin: '20px 0'
                  }}>
                    This conversation has ended.
                  </p>
                  {console.log("Rendering conversation ended container, feedbackAvailable:", feedbackAvailable)}
                  {feedbackAvailable && (
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '10px', 
                      width: '100%', 
                      maxWidth: 'calc(100% - 40px)', 
                      margin: '0 auto',
                      alignItems: 'center'
                    }}>
                      <button 
                        className="view-feedback-btn"
                        onClick={handleViewFeedbackSummary}
                        disabled={isLoading || isFeedbackLoading}
                        style={{
                          backgroundColor: '#2196f3',
                          color: 'white',
                          border: '1px solid #ccc',
                          borderRadius: '8px',
                          padding: '12px 15px',
                          fontSize: '16px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          width: 'calc(100% - 2px)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto'
                        }}
                      >
                        {isFeedbackLoading ? 'Loading Feedback...' : 'View Feedback Summary'}
                      </button>
                      <button
                        className="start-new-conversation-btn"
                        onClick={handleStartNewConversation}
                        title="Start new conversation"
                        style={{
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          border: '1px solid #ccc',
                          borderRadius: '8px',
                          padding: '12px 15px',
                          fontSize: '16px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          width: 'calc(100% - 2px)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto'
                        }}
                      >
                          <i className="fas fa-plus" style={{ 
                            marginRight: '8px',
                            animation: 'none',
                            transform: 'none',
                            transition: 'none'
                          }}></i>
                          Start New Conversation
                        </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ 
                  position: 'relative',
                  width: '100%'
                }}>
                  <textarea
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    placeholder="Type your message in Icelandic..."
                    disabled={isLoading || isTyping}
                    className="message-input"
                    onKeyDown={(e) => handleKeyPress(e, 'send')}
                    style={{ marginBottom: '10px' }}
                  />
                  <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '10px',
                    justifyContent: 'space-between',
                    height: '42px'
                  }}>
                    <button
                      onClick={handleSendMessage}
                      disabled={!userMessage.trim() || isLoading || isTyping}
                      className="send-button"
                      style={{ 
                        flex: '1',
                        height: '100%',
                        margin: 0
                      }}
                    >
                      {isLoading ? (
                        <i className="fas fa-spinner fa-spin"></i>
                      ) : (
                        <>
                          Send <i className="fas fa-arrow-up"></i>
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleEndConversation}
                      disabled={isLoading || isTyping || !hasUserResponded}
                      className="end-conversation-btn"
                      title={hasUserResponded ? "End conversation here" : "Send at least one message before ending the conversation"}
                      style={{ 
                        minWidth: '50px', 
                        padding: '10px',
                        height: '100%',
                        margin: 0,
                        opacity: hasUserResponded ? 1 : 0.5,
                        cursor: hasUserResponded ? 'pointer' : 'not-allowed'
                      }}
                    >
                      <i className="fas fa-flag-checkered"></i>
                    </button>
                  </div>
                </div>
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