import React, { useState } from 'react';
import PronunciationButton from './PronunciationButton';
import './Flashcard.css';

const Flashcard = ({ card }) => {
  const [flipped, setFlipped] = useState(false);

  const handleFlip = () => {
    setFlipped(!flipped);
  };

  // Ensure we have a valid card object with required properties
  if (!card || !card.front || !card.back) {
    console.error("Invalid card data:", card);
    return <div className="error-card">Invalid card data</div>;
  }

  console.log("Rendering flashcard:", card);

  return (
    <div className="flashcard-container">
      <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={handleFlip}>
        <div className="flashcard-inner">
          <div className="flashcard-front">
            <h3>{card.front}</h3>
            {card.additional_info && (
              <div className="additional-info">{card.additional_info}</div>
            )}
            {/* Pronunciation button on front */}
            <div style={{ 
              position: 'absolute', 
              bottom: '10px', 
              right: '10px', 
              zIndex: 10 
            }}>
              <PronunciationButton text={card.front} />
            </div>
          </div>
          <div className="flashcard-back">
            <h3>{card.back}</h3>
            {/* Pronunciation button on back */}
            <div style={{ 
              position: 'absolute', 
              bottom: '10px', 
              right: '10px', 
              zIndex: 10 
            }}>
              <PronunciationButton text={card.back} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Flashcard; 