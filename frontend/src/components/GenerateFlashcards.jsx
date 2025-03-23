import React, { useState, useEffect } from 'react';
import axios from 'axios';
import HomeButton from './HomeButton';
import config from '../config';

const GenerateFlashcards = ({ userId }) => {
  const [topic, setTopic] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedFlashcards, setGeneratedFlashcards] = useState([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const handleGenerate = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      console.log('Sending request with:', { userId, topic, quantity });
      
      const response = await axios.post(`${config.API_URL}/generate_flashcards`, {
        user_id: userId,
        topic: topic,
        quantity: quantity
      });

      console.log('Response:', response.data);
      setGeneratedFlashcards(response.data.flashcards || []);
    } catch (err) {
      console.error('Generation error:', err.response || err);
      setError(
        err.response?.data?.error || 
        err.response?.data?.message || 
        err.message || 
        'Unknown error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToLibrary = async (flashcard) => {
    try {
      console.log('Saving flashcard:', flashcard);
      const response = await axios.post(`${config.API_URL}/save_to_library`, {
        user_id: userId,
        flashcard: {
          ...flashcard,
          topic: topic
        }
      });
      console.log('Save response:', response.data);
      
      if (response.data.message) {
        setGeneratedFlashcards(prev => prev.filter(fc => fc !== flashcard));
      }
    } catch (err) {
      console.error('Failed to save flashcard:', err);
      setError('Failed to save flashcard to library: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveAll = async () => {
    setIsLoading(true);
    try {
        // Save each flashcard in the array
        const savePromises = generatedFlashcards.map(flashcard => 
            axios.post(`${config.API_URL}/save_to_library`, {
                user_id: userId,
                flashcard: {
                    front: flashcard.front,
                    back: flashcard.back,
                    additional_info: flashcard.additional_info,
                    topic: topic
                }
            })
        );

        // Wait for all save operations to complete and collect responses
        const responses = await Promise.all(savePromises);
        
        // Check if all saves were successful
        const allSuccessful = responses.every(response => 
            response.status === 200 && response.data.message
        );

        if (allSuccessful) {
            setMessage('All flashcards saved successfully!');
            setMessageType('success');
            // Clear the generated flashcards after successful save
            setGeneratedFlashcards([]);
        } else {
            throw new Error('Some flashcards failed to save');
        }

    } catch (error) {
        console.error('Error saving flashcards:', error);
        setMessage(
            error.response?.data?.error || 
            error.message || 
            'Failed to save all flashcards. Please try again.'
        );
        setMessageType('error');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div>
      <HomeButton />
      <h2>Generate Flashcards</h2>
      
      {message && (
        <div style={{ 
          color: messageType === 'success' ? 'green' : 'red',
          margin: '10px 0',
          textAlign: 'center'
        }}>
          {message}
        </div>
      )}
      
      {error && (
        <div style={{ color: 'red', margin: '10px 0' }}>
          Error: {error}
        </div>
      )}
      
      <form onSubmit={handleGenerate}>
        <div>
          <label>
            Topic:
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Number of Flashcards:
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              min="1"
              max="50"
              required
            />
          </label>
        </div>
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Generating...' : 'Generate Flashcards'}
        </button>
      </form>

      {generatedFlashcards.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ 
            display: 'flex',
            justifyContent: 'flex-end',
            paddingRight: '8px',
            marginBottom: '10px'
          }}>
            <button
              onClick={handleSaveAll}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                width: 'fit-content'
              }}
            >
              {isLoading ? 'Saving...' : 'Save All to Library'}
            </button>
          </div>

          <h3>Generated Flashcards</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>English</th>
                <th>Icelandic</th>
                <th>Additional Info</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {generatedFlashcards.map((flashcard, index) => (
                <tr key={index}>
                  <td>{flashcard.front}</td>
                  <td>{flashcard.back}</td>
                  <td>{flashcard.additional_info}</td>
                  <td>
                    <button onClick={() => handleSaveToLibrary(flashcard)}>
                      Save to Library
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GenerateFlashcards; 