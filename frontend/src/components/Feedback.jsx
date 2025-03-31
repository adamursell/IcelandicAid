import React, { useState } from 'react';
import axios from 'axios';
import config from '../config';
import './Feedback.css';

const Feedback = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const feedbackOptions = [
    'Error when generating flashcards',
    'Error when logging in',
    'Generated Icelandic incorrect',
    'Feedback incorrect',
    'UI/UX improvement suggestion',
    'Feature request',
    'Other'
  ];

  const toggleFeedback = () => {
    setIsOpen(!isOpen);
    // Reset form when reopening
    if (!isOpen) {
      setFeedbackType('');
      setFeedbackText('');
      setSubmitted(false);
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!feedbackType) {
      setError('Please select a feedback type');
      return;
    }

    if (!feedbackText.trim()) {
      setError('Please provide some details about your feedback');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const userId = localStorage.getItem('userId') || 'anonymous';
      
      console.log('Submitting feedback:', {
        userId,
        feedbackType,
        feedbackText
      });
      
      // Submit feedback to backend
      const response = await axios.post(`${config.API_URL}/submit-feedback`, {
        userId,
        feedbackType,
        feedbackText
      });
      
      console.log('Feedback response:', response);
      
      if (response.data.success) {
        setSubmitted(true);
        setFeedbackType('');
        setFeedbackText('');
        
        // Close the feedback form after a delay
        setTimeout(() => {
          setIsOpen(false);
          setSubmitted(false);
        }, 3000);
      } else {
        setError(response.data.message || 'Failed to submit feedback');
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="feedback-feature">
      <button 
        className="feedback-toggle-button"
        onClick={toggleFeedback}
      >
        <i className="fas fa-comment-alt"></i> Feedback
      </button>

      {isOpen && (
        <div className="feedback-form-container">
          <div className="feedback-form-header">
            <h3>Share Your Feedback</h3>
            <button 
              className="feedback-close-button"
              onClick={toggleFeedback}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          {submitted ? (
            <div className="feedback-success">
              <i className="fas fa-check-circle"></i>
              <p>Thanks for your feedback!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="feedback-form-group">
                <label>What type of feedback do you have?</label>
                <select
                  value={feedbackType}
                  onChange={(e) => setFeedbackType(e.target.value)}
                  required
                >
                  <option value="">Select an option</option>
                  {feedbackOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="feedback-form-group">
                <label>Tell us more:</label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Please provide details about your feedback..."
                  rows="4"
                  required
                />
              </div>

              {error && <div className="feedback-error">{error}</div>}

              <button 
                type="submit" 
                className="feedback-submit-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default Feedback; 