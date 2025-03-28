import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './ChallengingWordsTable.css';

const ChallengingWordsTable = ({ wordData, userId }) => {
  console.log('ChallengingWordsTable rendered with wordData:', wordData);
  const [savedWords, setSavedWords] = useState([]);
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  
  // Function to extract words from different data formats
  const extractWords = (data) => {
    if (!data) return [];
    
    // If it's already an array of word objects
    if (Array.isArray(data)) {
      console.log("Data is an array of words:", data);
      return data.map(word => {
        // Normalize the word object to have consistent properties
        return {
          icelandic: word.icelandic || word[0] || "",
          english: word.english || word[1] || "",
          part_of_speech: word.part_of_speech || word[2] || "",
          note: word.note || word[3] || ""
        };
      });
    }
    
    // If it's the table format
    if (data.rows && Array.isArray(data.rows)) {
      console.log("Data is in table format:", data);
      return data.rows.map(row => {
        return {
          icelandic: row[0] || "",
          english: row[1] || "",
          part_of_speech: row[2] || "",
          note: row[3] || ""
        };
      });
    }
    
    // If it's the words array inside a wordData object
    if (data.words && Array.isArray(data.words)) {
      console.log("Data contains a words array:", data.words);
      return data.words.map(word => {
        return {
          icelandic: word.icelandic || word[0] || "",
          english: word.english || word[1] || "",
          part_of_speech: word.part_of_speech || word[2] || "",
          note: word.note || word[3] || ""
        };
      });
    }
    
    console.error("Could not extract words from data:", data);
    return [];
  };

  // Extract words from wordData
  const words = extractWords(wordData);
  
  console.log("Extracted words:", words);
  
  // Check if we have valid words to display
  const hasWords = words.length > 0;

  const saveWordToLibrary = async (word) => {
    if (savedWords.includes(word.icelandic)) return;
    
    setLoading(prev => ({ ...prev, [word.icelandic]: true }));
    setError(prev => ({ ...prev, [word.icelandic]: null }));
    
    try {
      console.log(`Saving word to library: ${word.icelandic} - ${word.english}`);
      const response = await api.post(`/users/${userId}/save-challenging-word`, {
        icelandic: word.icelandic,
        english: word.english,
        part_of_speech: word.part_of_speech,
        note: word.note,
        topic: 'Conversation Words'
      });
      
      if (response.status === 200) {
        console.log("Word saved successfully:", response.data);
        setSavedWords(prev => [...prev, word.icelandic]);
      }
    } catch (err) {
      console.error('Error saving word:', err);
      setError(prev => ({ 
        ...prev, 
        [word.icelandic]: 'Failed to save. Please try again.' 
      }));
    } finally {
      setLoading(prev => ({ ...prev, [word.icelandic]: false }));
    }
  };
  
  if (!wordData) {
    return (
      <div className="challenging-words-container">
        <h3>Challenging Words</h3>
        <p className="no-words-message">No challenging words data available.</p>
      </div>
    );
  }
  
  if (!hasWords) {
    return (
      <div className="challenging-words-container">
        <h3>Challenging Words</h3>
        <p className="no-words-message">No challenging words were identified in this conversation.</p>
      </div>
    );
  }

  return (
    <div className="challenging-words-container">
      <h3>Words You Struggled With</h3>
      <p className="words-description">
        These are words you found challenging during the conversation. 
        Click 'Add to Library' to save them for practice later.
      </p>
      
      <div className="table-responsive">
        <table className="challenging-words-table">
          <thead>
            <tr>
              <th>Icelandic</th>
              <th>English</th>
              <th>Part of Speech</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {words.map((word, index) => (
              <tr 
                key={index} 
                className={savedWords.includes(word.icelandic) ? 'saved-word' : ''}
              >
                <td className="word-icelandic">{word.icelandic}</td>
                <td>{word.english}</td>
                <td>{word.part_of_speech}</td>
                <td>{word.note}</td>
                <td>
                  {savedWords.includes(word.icelandic) ? (
                    <div className="saved-button">
                      <span className="checkmark">✓</span> Saved
                    </div>
                  ) : (
                    <>
                      <button 
                        className="save-word-btn"
                        onClick={() => saveWordToLibrary(word)}
                        disabled={loading[word.icelandic]}
                      >
                        {loading[word.icelandic] ? 'Saving...' : 'Add to Library'}
                      </button>
                      {error[word.icelandic] && (
                        <div className="error-message">{error[word.icelandic]}</div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ChallengingWordsTable; 