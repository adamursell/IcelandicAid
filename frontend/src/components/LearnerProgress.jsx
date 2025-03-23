import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HomeButton from './HomeButton';
import LogoutButton from './LogoutButton';
import config from '../config';
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Pie, Line, Bar } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const LearnerProgress = ({ userId, onLogout, isEmbedded = false }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('conversation');
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('progress');
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const [practiceStreak, setPracticeStreak] = useState(0);
  const [activeGraph, setActiveGraph] = useState('overall');

  useEffect(() => {
    fetchProgressData();
  }, [userId]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${config.API_URL}/users/${userId}/progress`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch progress data');
      }
      
      const data = await response.json();
      setProgressData(data);
      
      // Set the practice streak from the API response
      if (data.flashcards && data.flashcards.streak) {
        setPracticeStreak(data.flashcards.streak.current);
        setDueFlashcards(data.flashcards.streak.due_today);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching progress data:', error);
      setError('Failed to load progress data. Please try again later.');
      setLoading(false);
    }
  };

  // Function to get color based on score (heatmap from red to green)
  const getScoreColor = (score) => {
    // Score from 1-10
    if (score <= 3) return '#e74c3c'; // Red for low scores
    if (score <= 5) return '#f39c12'; // Orange/Yellow for medium-low scores
    if (score <= 7) return '#f1c40f'; // Yellow for medium scores
    if (score <= 9) return '#2ecc71'; // Light green for good scores
    return '#27ae60'; // Dark green for excellent scores
  };

  const getLineChartData = (scores, averageScore, label) => {
    // Create labels for the last 10 conversations (or fewer if less than 10)
    const labels = Array.from({ length: scores.length }, (_, i) => `Conversation ${scores.length - i}`);
    
    return {
      labels,
      datasets: [
        {
          label: `${label} in last ${scores.length}`,
          data: [...scores].reverse(), // Reverse to show oldest to newest
          borderColor: '#5DADE2',
          backgroundColor: 'rgba(93, 173, 226, 0.5)',
          tension: 0.1,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: `Average ${label.toLowerCase()} all time`,
          data: Array(scores.length).fill(averageScore),
          borderColor: '#8E44AD',
          backgroundColor: 'rgba(142, 68, 173, 0.5)',
          borderDash: [5, 5],
          tension: 0,
          pointRadius: 0, // Remove points/markers
          pointHoverRadius: 0, // Remove hover points
        },
      ],
    };
  };

  const getPieChartData = (wordTypes) => {
    const colors = [
      '#9B59B6', // Purple for Noun
      '#E74C3C', // Red for Verb
      '#2ECC71', // Green for Adjective
      '#3498DB', // Blue for Adverb
      '#F1C40F', // Yellow for Pronoun
      '#1ABC9C', // Turquoise for Preposition
      '#D35400', // Orange for Conjunction
      '#34495E', // Dark blue for Other
    ];

    // If wordTypes is empty or not an object, use a default
    if (!wordTypes || typeof wordTypes !== 'object' || Object.keys(wordTypes).length === 0) {
      return {
        labels: ['No data available'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#cccccc'],
            borderWidth: 1,
          },
        ],
      };
    }

    // Filter out any empty keys or values that are not numbers
    const filteredWordTypes = Object.entries(wordTypes)
      .filter(([key, value]) => key && key.trim() !== '' && typeof value === 'number' && value > 0)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
      
    // If after filtering we have no valid data, return default
    if (Object.keys(filteredWordTypes).length === 0) {
      return {
        labels: ['No valid data'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#cccccc'],
            borderWidth: 1,
          },
        ],
      };
    }

    // Sort word types by count (descending)
    const sortedEntries = Object.entries(filteredWordTypes).sort((a, b) => b[1] - a[1]);
    
    // Take the top 7 categories, combine the rest into "Other"
    let labels = [];
    let data = [];
    let otherCount = 0;
    
    sortedEntries.forEach((entry, index) => {
      if (index < 7) {
        labels.push(entry[0]);
        data.push(entry[1]);
      } else {
        otherCount += entry[1];
      }
    });
    
    // Add "Other" category if needed
    if (otherCount > 0) {
      labels.push('Other');
      data.push(otherCount);
    }

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 1,
        },
      ],
    };
  };

  const getBarChartData = (knowledgeLevels) => {
    return {
      labels: ['Unpracticed', 'Recognised', 'Developing', 'Confident', 'Mastered'],
      datasets: [
        {
          data: [
            knowledgeLevels.unpracticed,
            knowledgeLevels.recognised,
            knowledgeLevels.developing,
            knowledgeLevels.confident,
            knowledgeLevels.mastered,
          ],
          backgroundColor: [
            '#8B0000', // Dark red for Unpracticed
            '#FF0000', // Red for Recognised
            '#ADD8E6', // Light blue for Developing
            '#1E90FF', // Blue for Confident
            '#00008B', // Dark blue for Mastered
          ],
        },
      ],
    };
  };

  const renderConversationProgress = () => {
    if (!progressData || !progressData.conversation) {
      return <div className="no-data-message">No conversation data available.</div>;
    }

    const { conversation } = progressData;
    
    if (conversation.total_conversations === 0) {
      return (
        <div className="no-data-message">
          You need to practice conversations before you can check your progress.
        </div>
      );
    }

    const overallScoreData = getLineChartData(
      conversation.overall_score.last_10,
      conversation.overall_score.average,
      'Overall conversation score'
    );

    const grammarScoreData = getLineChartData(
      conversation.grammar_score.last_10,
      conversation.grammar_score.average,
      'Grammar score'
    );

    const vocabularyScoreData = getLineChartData(
      conversation.vocabulary_score.last_10,
      conversation.vocabulary_score.average,
      'Vocabulary score'
    );

    // Function to render the active graph based on selection
    const renderActiveGraph = () => {
      // Common chart options for all graphs
      const chartOptions = {
        scales: {
          y: {
            min: 0,
            max: 10,
            ticks: {
              stepSize: 2,
              color: '#34495E'
            },
            grid: {
              display: false
            }
          },
          x: {
            display: false,
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#34495E',
              usePointStyle: true,
              pointStyle: 'circle'
            }
          }
        },
        elements: {
          line: {
            borderWidth: 2
          }
        }
      };

      switch (activeGraph) {
        case 'overall':
          return (
            <div className="chart-section">
              <h3>Overall conversation score</h3>
              <div className="chart-wrapper">
                <Line 
                  data={overallScoreData} 
                  options={chartOptions}
                />
              </div>
            </div>
          );
        case 'grammar':
          return (
            <div className="chart-section">
              <h3>Grammatical accuracy</h3>
              <div className="chart-wrapper">
                <Line 
                  data={grammarScoreData} 
                  options={chartOptions}
                />
              </div>
            </div>
          );
        case 'vocabulary':
          return (
            <div className="chart-section">
              <h3>Vocabulary usage</h3>
              <div className="chart-wrapper">
                <Line 
                  data={vocabularyScoreData} 
                  options={chartOptions}
                />
              </div>
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <div className="conversation-progress">
        <div className="stats-header" style={{ justifyContent: 'space-between', gap: '20px', marginBottom: '20px' }}>
          <div className="stat-box">
            <h3>&nbsp;</h3>
            <div className="stat-value" style={{ color: getScoreColor(conversation.overall_score.average), fontSize: '36px' }}>
              {conversation.overall_score.average}
            </div>
            <div className="stat-label">Average overall conversation score</div>
          </div>
          <div className="stat-box">
            <h3>&nbsp;</h3>
            <div className="stat-value" style={{ color: getScoreColor(conversation.grammar_score.average), fontSize: '36px' }}>
              {conversation.grammar_score.average}
            </div>
            <div className="stat-label">Average grammatical accuracy</div>
          </div>
          <div className="stat-box">
            <h3>&nbsp;</h3>
            <div className="stat-value" style={{ color: getScoreColor(conversation.vocabulary_score.average), fontSize: '36px' }}>
              {conversation.vocabulary_score.average}
            </div>
            <div className="stat-label">Average vocabulary usage</div>
          </div>
        </div>
        
        <div className="stats-header" style={{ justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
          <div className="stat-box" style={{ flex: '0 1 calc(33% - 20px)', maxWidth: '300px' }}>
            <h3>&nbsp;</h3>
            <div className="stat-value" style={{ fontSize: '48px', color: '#5DADE2' }}>{conversation.total_conversations}</div>
            <div className="stat-label">Conversations practiced</div>
          </div>
          <div className="stat-box" style={{ flex: '0 1 calc(33% - 20px)', maxWidth: '300px' }}>
            <h3>&nbsp;</h3>
            <div className="stat-value" style={{ fontSize: '48px', color: '#5DADE2' }}>{conversation.streak?.current || 0}</div>
            <div className="stat-label">Conversation practice streak</div>
          </div>
        </div>

        <div className="graph-selector">
          <button 
            className={`graph-button ${activeGraph === 'overall' ? 'active' : ''}`}
            onClick={() => setActiveGraph('overall')}
          >
            Overall Conversation Score
          </button>
          <button 
            className={`graph-button ${activeGraph === 'grammar' ? 'active' : ''}`}
            onClick={() => setActiveGraph('grammar')}
          >
            Grammatical Accuracy
          </button>
          <button 
            className={`graph-button ${activeGraph === 'vocabulary' ? 'active' : ''}`}
            onClick={() => setActiveGraph('vocabulary')}
          >
            Vocabulary Usage
          </button>
        </div>

        <div className="charts-container single-chart">
          {renderActiveGraph()}
        </div>

        <div className="feedback-container">
          <div className="feedback-column">
            <h3>Recent strengths:</h3>
            <ul>
              {conversation.strengths.length > 0 ? (
                conversation.strengths.slice(0, 6).map((strength, index) => (
                  <li key={`strength-${index}`}>{strength}</li>
                ))
              ) : (
                <li>No strengths recorded yet</li>
              )}
            </ul>
          </div>
          <div className="feedback-column">
            <h3>Recent areas to focus on:</h3>
            <ul>
              {conversation.areas_to_improve.length > 0 ? (
                conversation.areas_to_improve.slice(0, 6).map((area, index) => (
                  <li key={`area-${index}`}>{area}</li>
                ))
              ) : (
                <li>No areas to improve recorded yet</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderFlashcardProgress = () => {
    if (!progressData || !progressData.flashcards) {
      return <div className="no-data-message">No flashcard data available.</div>;
    }

    const { flashcards } = progressData;
    
    if (flashcards.total_flashcards === 0) {
      return (
        <div className="no-data-message">
          You need to generate flashcards before you can check your progress.
        </div>
      );
    }

    // Log the data to help with debugging
    console.log("Flashcard progress data:", flashcards);
    console.log("Word types:", flashcards.word_types);
    console.log("Total topics:", flashcards.total_topics);
    console.log("Due flashcards:", dueFlashcards);
    console.log("Practice streak:", practiceStreak);

    // Create a pie chart data from knowledge levels instead of bar chart
    const knowledgeLevelsPieData = {
      labels: ['Unpracticed', 'Recognised', 'Developing', 'Confident', 'Mastered'],
      datasets: [
        {
          data: [
            flashcards.knowledge_levels.unpracticed,
            flashcards.knowledge_levels.recognised,
            flashcards.knowledge_levels.developing,
            flashcards.knowledge_levels.confident,
            flashcards.knowledge_levels.mastered,
          ],
          backgroundColor: [
            '#E74C3C', // Red for Unpracticed (worst)
            '#F39C12', // Orange for Recognised
            '#F1C40F', // Yellow for Developing
            '#3498DB', // Light blue for Confident
            '#5DADE2', // Brighter blue for Mastered (best)
          ],
        },
      ],
    };

    return (
      <div className="flashcard-progress">
        <div className="library-stats">
          <div className="stat-box large">
            <div className="stat-value">{flashcards.total_flashcards}</div>
            <div className="stat-label">Flashcards in library</div>
          </div>
          <div className="stat-box large">
            <div className="stat-value">{dueFlashcards}</div>
            <div className="stat-label">Due for practice today</div>
          </div>
          <div className="stat-box large">
            <div className="stat-value">{practiceStreak}</div>
            <div className="stat-label">Day streak</div>
          </div>
        </div>

        <div className="charts-container">
          <div className="chart-section pie-chart-section">
            <h3>Vocabulary knowledge</h3>
            <div className="chart-wrapper">
              <Pie 
                data={knowledgeLevelsPieData} 
                options={{
                  plugins: {
                    legend: {
                      position: 'right',
                      align: 'center',
                      labels: {
                        color: '#34495E',
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                          size: 14,
                          weight: 500
                        },
                        boxWidth: 12
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const label = context.label || '';
                          const value = context.raw || 0;
                          const total = context.dataset.data.reduce((a, b) => a + b, 0);
                          const percentage = Math.round((value / total) * 100);
                          return `${label}: ${value} (${percentage}%)`;
                        }
                      }
                    }
                  },
                  layout: {
                    padding: {
                      right: 20,
                      left: 10,
                      top: 5,
                      bottom: 5
                    }
                  },
                  maintainAspectRatio: false,
                  responsive: true
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleSectionChange = (section) => {
    setActiveSection(section);
  };

  const renderLoginDetails = () => {
    return (
      <div className="account-section">
        <h2>Login Details</h2>
        <p>Edit your login information here.</p>
      </div>
    );
  };

  const renderLearnerPersonalisation = () => {
    return (
      <div className="account-section">
        <h2>Learner Personalisation</h2>
        <p>Customize your learning experience here.</p>
      </div>
    );
  };

  // If embedded in AccountSettings, only render the progress content
  if (isEmbedded) {
    return (
      <div>
        <div className="progress-tabs">
          <div 
            className={`progress-tab ${activeTab === 'conversation' ? 'active' : ''}`}
            onClick={() => setActiveTab('conversation')}
          >
            Conversation skills
          </div>
          <div 
            className={`progress-tab ${activeTab === 'flashcard' ? 'active' : ''}`}
            onClick={() => setActiveTab('flashcard')}
          >
            Flashcard practice
          </div>
        </div>

        <div className="progress-content">
          {loading ? (
            <div className="loading">Loading progress data...</div>
          ) : (
            activeTab === 'conversation' ? renderConversationProgress() : renderFlashcardProgress()
          )}
        </div>
      </div>
    );
  }

  // Standalone page
  return (
    <div className="container" style={{ position: 'relative', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <HomeButton />
        <LogoutButton onLogout={onLogout} />
      </div>
      
      <h1 style={{ color: '#5DADE2', textAlign: 'center', marginBottom: '30px' }}>User Profile</h1>
      
      {error && <div className="error">{error}</div>}

      <div className="account-settings-container">
        {/* Left-side menu */}
        <div className="account-menu">
          <div 
            className={`account-menu-item ${activeSection === 'progress' ? 'active' : ''}`}
            onClick={() => handleSectionChange('progress')}
          >
            Learner Progress
          </div>
          <div 
            className={`account-menu-item ${activeSection === 'login' ? 'active' : ''}`}
            onClick={() => handleSectionChange('login')}
          >
            Login Details
          </div>
          <div 
            className={`account-menu-item ${activeSection === 'learner' ? 'active' : ''}`}
            onClick={() => handleSectionChange('learner')}
          >
            Learner Personalisation
          </div>
        </div>

        {/* Right-side content */}
        <div className="account-content">
          {activeSection === 'progress' && (
            <div>
              <div className="progress-tabs">
                <div 
                  className={`progress-tab ${activeTab === 'conversation' ? 'active' : ''}`}
                  onClick={() => setActiveTab('conversation')}
                >
                  Conversation skills
                </div>
                <div 
                  className={`progress-tab ${activeTab === 'flashcard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('flashcard')}
                >
                  Flashcard practice
                </div>
              </div>

              <div className="progress-content">
                {loading ? (
                  <div className="loading">Loading progress data...</div>
                ) : (
                  activeTab === 'conversation' ? renderConversationProgress() : renderFlashcardProgress()
                )}
              </div>
            </div>
          )}
          {activeSection === 'login' && renderLoginDetails()}
          {activeSection === 'learner' && renderLearnerPersonalisation()}
        </div>
      </div>
    </div>
  );
};

export default LearnerProgress; 