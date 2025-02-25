import React, { useState } from 'react';
import axios from 'axios';
import HomeButton from './HomeButton';

const GenerateFlashcards = ({ userId }) => {
  const [topic, setTopic] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [skillLevel, setSkillLevel] = useState('beginner');
  const [profile, setProfile] = useState('');
  const [flashcards, setFlashcards] = useState([]);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await axios.post('http://127.0.0.1:5000/generate_flashcards', {
        topic,
        quantity,
        skill_level: skillLevel,
        speaker_profile: profile,
      });
      setFlashcards(response.data.flashcards);
      setError('');
    } catch (err) {
      setError('Flashcard generation error: ' + (err.response?.data?.error || 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    try {
      await axios.post('http://127.0.0.1:5000/save_flashcards', {
        user_id: userId,
        flashcards,
        topic,
      });
      alert('Flashcards saved successfully!');
      setFlashcards([]); // Clear flashcards after saving
    } catch (err) {
      alert('Failed to save flashcards: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const handleDiscard = () => {
    setFlashcards([]); // Clear flashcards without saving
  };

  return (
    <div>
      <HomeButton />
      <h2>Generate Flashcards</h2>
      {error && <div className="error">{error}</div>}
      <div>
        <input
          type="text"
          placeholder="Flashcard Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <input
          type="number"
          min="1"
          max="20"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="expert">Expert</option>
        </select>
        <input
          type="text"
          placeholder="User Profile"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
        />
        <button 
          onClick={handleGenerate} 
          disabled={isGenerating}
          style={{ opacity: isGenerating ? 0.7 : 1 }}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
      </div>
      {flashcards.length > 0 && (
        <div>
          <h3>Generated Flashcards</h3>
          <ul>
            {flashcards.map((fc, index) => (
              <li key={index}>
                {fc.front} - {fc.back} ({fc.additional_info})
              </li>
            ))}
          </ul>
          <button onClick={handleSave}>Save to Library</button>
          <button onClick={handleDiscard}>Discard</button>
        </div>
      )}
    </div>
  );
};

export default GenerateFlashcards; 