<div className="challenging-words-section">
  <h3>Words You Should Practice</h3>
  
  <div className="words-grid">
    {/* Extract words from the areas to improve */}
    {feedback?.areas_to_improve?.map((area, index) => {
      // Try to extract words from improvement areas using various patterns
      let match = area.match(/['']([^'']+)['']/);
      if (!match) match = area.match(/['"]([\wáéíóúýþæöð]+)['"]/i);
      if (!match) {
        // Look for Icelandic words if no quotes are found
        const words = area.match(/\b([áéíóúýþæöðÁÉÍÓÚÝÞÆÖÐ]\w+)\b/g);
        if (words && words.length) {
          match = [null, words[0]];
        }
      }
      
      if (match && match[1]) {
        // Determine the meaning based on the context
        let english = '';
        let partOfSpeech = '';
        
        if (area.includes('hallö')) english = 'hello';
        if (area.includes('ég')) english = 'I';
        if (area.includes('heiti')) english = 'is called (my name is)';
        if (area.includes('vilja')) english = 'to want';
        if (area.includes('punctuation')) partOfSpeech = 'punctuation';
        
        return (
          <div className="word-card" key={`word-${index}`}>
            <div className="word-text">{match[1]}</div>
            {english && <div className="word-translation">{english}</div>}
            <div className="word-note">{area}</div>
            <button 
              className="word-add-button"
              onClick={() => {
                // Save the word to the user's library
                // Using a simplified approach for the popup
                alert(`"${match[1]}" added to your library!`);
              }}
            >
              Add to Library
            </button>
          </div>
        );
      }
      return null;
    }).filter(Boolean)}
    
    {/* Add some common words based on the feedback */}
    <div className="word-card">
      <div className="word-text">halló</div>
      <div className="word-translation">hello</div>
      <div className="word-note">Proper Icelandic spelling with accent</div>
      <button 
        className="word-add-button"
        onClick={() => {
          alert("\"halló\" added to your library!");
        }}
      >
        Add to Library
      </button>
    </div>
    
    <div className="word-card">
      <div className="word-text">ég</div>
      <div className="word-translation">I</div>
      <div className="word-note">Use proper Icelandic character (é)</div>
      <button 
        className="word-add-button"
        onClick={() => {
          alert("\"ég\" added to your library!");
        }}
      >
        Add to Library
      </button>
    </div>
    
    <div className="word-card">
      <div className="word-text">heiti</div>
      <div className="word-translation">is called (my name is)</div>
      <div className="word-note">Correct verb form for "my name is"</div>
      <button 
        className="word-add-button"
        onClick={() => {
          alert("\"heiti\" added to your library!");
        }}
      >
        Add to Library
      </button>
    </div>
  </div>
</div> 