{/* Challenging Words Section */}
<div className="feedback-section challenging-words">
  <h3>Words to Practice</h3>
  <div className="words-cards">
    <div className="word-item">
      <span className="word">halló</span>
      <span className="translation">hello</span>
      <button 
        className="add-to-library" 
        onClick={() => alert('"halló" added to your library!')}
      >
        Add to Library
      </button>
    </div>
    
    <div className="word-item">
      <span className="word">ég</span>
      <span className="translation">I (pronoun)</span>
      <button 
        className="add-to-library"
        onClick={() => alert('"ég" added to your library!')}
      >
        Add to Library
      </button>
    </div>
    
    <div className="word-item">
      <span className="word">heiti</span>
      <span className="translation">is called (my name is)</span>
      <button 
        className="add-to-library"
        onClick={() => alert('"heiti" added to your library!')}
      >
        Add to Library
      </button>
    </div>
  </div>
</div> 