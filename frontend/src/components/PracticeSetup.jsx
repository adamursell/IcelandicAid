import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import HomeButton from './HomeButton';

const PracticeSetup = () => {
  const [numFlashcards, setNumFlashcards] = useState(10);
  const history = useHistory();

  const handleStart = () => {
    history.push(`/practice/session?num=${numFlashcards}`);
  };

  return (
    <div>
      <HomeButton />
      <h2>Practice Setup</h2>
      <input
        type="number"
        min="1"
        max="50"
        value={numFlashcards}
        onChange={(e) => setNumFlashcards(e.target.value)}
      />
      <button onClick={handleStart}>Start Practice</button>
    </div>
  );
};

export default PracticeSetup; 