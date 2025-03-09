// Add a new function to handle saving all flashcards
const handleSaveAll = async () => {
  setIsLoading(true);
  try {
    // Save each flashcard in the array
    const savePromises = flashcards.map(flashcard => 
      fetch('/api/save_to_library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          flashcard: {
            front: flashcard.front,
            back: flashcard.back,
            additional_info: flashcard.additional_info,
            topic: topic
          }
        })
      })
    );

    // Wait for all save operations to complete
    await Promise.all(savePromises);
    
    // Show success message
    setMessage('All flashcards saved successfully!');
    setMessageType('success');
    
    // Clear the generated flashcards after saving
    setFlashcards([]);
  } catch (error) {
    console.error('Error saving flashcards:', error);
    setMessage('Failed to save all flashcards. Please try again.');
    setMessageType('error');
  } finally {
    setIsLoading(false);
  }
};

// In the render section, add the Save All button above the flashcards
return (
  <div className="flashcard-generator">
    {/* ... existing form and controls ... */}

    {flashcards.length > 0 && (
      <div className="save-all-container" style={{ 
        margin: '20px 0',
        textAlign: 'center'
      }}>
        <button
          onClick={handleSaveAll}
          disabled={isLoading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginBottom: '20px'
          }}
        >
          {isLoading ? 'Saving...' : 'Save All Flashcards to Library'}
        </button>
      </div>
    )}

    <div className="flashcards-container">
      {flashcards.map((flashcard, index) => (
        <div key={index} className="flashcard">
          {/* ... existing flashcard display ... */}
        </div>
      ))}
    </div>
  </div>
); 