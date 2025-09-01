import React from 'react';
import { 
  compareLivenessFaceWithReferences, 
  loadReferenceImages, 
  findBestMatch, 
  createIdentificationReport,
  FaceComparisonResult 
} from '../utils/faceDetectionUtils';

interface ReferenceImage {
  id: string;
  name: string;
  file: File;
  preview: string;
}

interface FaceIdentificationProps {
  livenessResult: any;
  onIdentificationComplete: (report: any) => void;
}

export function FaceIdentification({ livenessResult, onIdentificationComplete }: FaceIdentificationProps) {
  const [referenceImages, setReferenceImages] = React.useState<ReferenceImage[]>([]);
  const [isComparing, setIsComparing] = React.useState(false);
  const [comparisonResults, setComparisonResults] = React.useState<FaceComparisonResult[]>([]);
  const [similarityThreshold, setSimilarityThreshold] = React.useState(80);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        // Extract person info from filename (expected format: "personId_personName.jpg")
        const fileName = file.name.split('.')[0];
        const [personId, ...nameParts] = fileName.split('_');
        const personName = nameParts.join(' ') || personId;

        const preview = URL.createObjectURL(file);
        
        setReferenceImages(prev => [...prev, {
          id: personId || `person_${Date.now()}`,
          name: personName || 'Unknown Person',
          file,
          preview
        }]);
      }
    });
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].preview);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const performFaceComparison = async () => {
    if (!livenessResult?.referenceImage?.Bytes || referenceImages.length === 0) {
      alert('Need both liveness result and reference images to compare');
      return;
    }

    setIsComparing(true);
    setComparisonResults([]);

    try {
      // Load reference images
      const refImageData = await loadReferenceImages(
        referenceImages.map(img => ({
          file: img.file,
          personId: img.id,
          personName: img.name
        }))
      );

      console.log(`Loaded ${refImageData.length} reference images`);

      // Compare with liveness detection result
      const results = await compareLivenessFaceWithReferences(
        livenessResult.referenceImage.Bytes,
        refImageData,
        similarityThreshold
      );

      setComparisonResults(results);

      // Create comprehensive report
      const report = createIdentificationReport(livenessResult, results);
      
      console.log('Face Identification Report:', report);
      onIdentificationComplete(report);

    } catch (error) {
      console.error('Face comparison failed:', error);
      alert(`Face comparison failed: ${error}`);
    } finally {
      setIsComparing(false);
    }
  };

  const bestMatch = findBestMatch(comparisonResults, similarityThreshold);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h3>🔍 Face Identification</h3>
      
      {/* Reference Images Upload */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
        <h4>📁 Upload Reference Images</h4>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
          Upload images of people to identify. Name files as: "personId_PersonName.jpg"
        </p>
        
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileUpload}
          style={{ marginBottom: '15px' }}
        />

        {/* Reference Images Grid */}
        {referenceImages.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
            {referenceImages.map((img, index) => (
              <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                <img 
                  src={img.preview} 
                  alt={img.name}
                  style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                />
                <p style={{ fontSize: '12px', margin: '5px 0', fontWeight: 'bold' }}>{img.name}</p>
                <p style={{ fontSize: '10px', margin: '0', color: '#666' }}>ID: {img.id}</p>
                <button 
                  onClick={() => removeReferenceImage(index)}
                  style={{ 
                    fontSize: '10px', 
                    padding: '2px 6px', 
                    backgroundColor: '#dc3545', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '3px',
                    marginTop: '5px',
                    cursor: 'pointer'
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparison Settings */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e8f4f8', borderRadius: '5px' }}>
        <h4>⚙️ Comparison Settings</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="similarity-threshold">Similarity Threshold:</label>
          <input
            id="similarity-threshold"
            type="range"
            min="50"
            max="99"
            value={similarityThreshold}
            onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: '40px', fontWeight: 'bold' }}>{similarityThreshold}%</span>
        </div>
        <p style={{ fontSize: '12px', color: '#666', margin: '5px 0' }}>
          Higher threshold = more strict matching (recommended: 80-95%)
        </p>
      </div>

      {/* Comparison Button */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          onClick={performFaceComparison}
          disabled={isComparing || !livenessResult?.referenceImage?.Bytes || referenceImages.length === 0}
          style={{
            padding: '12px 24px',
            backgroundColor: isComparing ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            cursor: isComparing ? 'not-allowed' : 'pointer',
          }}
        >
          {isComparing ? 'Comparing Faces...' : `Compare with ${referenceImages.length} Reference Images`}
        </button>
      </div>

      {/* Comparison Results */}
      {comparisonResults.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '20px', textAlign: 'center', borderRadius: '10px' }}>
          {bestMatch ? (
            <div style={{ 
              padding: '30px', 
              backgroundColor: '#d4edda', 
              borderRadius: '10px', 
              border: '2px solid #28a745'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>✅</div>
              <h3 style={{ color: '#155724', margin: '0 0 15px 0' }}>VERIFICATION SUCCESSFUL</h3>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '20px' }}>
                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: '#155724' }}>Matched Person:</h4>
                  <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '0', color: '#155724' }}>
                    {bestMatch.personName}
                  </p>
                  <p style={{ fontSize: '14px', margin: '5px 0 0 0', color: '#155724' }}>
                    Confidence: {bestMatch.matches[0]?.Similarity.toFixed(1)}%
                  </p>
                </div>
                {referenceImages.find(img => img.id === bestMatch.personId) && (
                  <div>
                    <p style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#155724' }}>Reference Image:</p>
                    <img 
                      src={referenceImages.find(img => img.id === bestMatch.personId)?.preview} 
                      alt={bestMatch.personName}
                      style={{ 
                        width: '100px', 
                        height: '100px', 
                        objectFit: 'cover', 
                        borderRadius: '8px',
                        border: '2px solid #28a745'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ 
              padding: '30px', 
              backgroundColor: '#f8d7da', 
              borderRadius: '10px', 
              border: '2px solid #dc3545'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>❌</div>
              <h3 style={{ color: '#721c24', margin: '0 0 15px 0' }}>VERIFICATION FAILED</h3>
              <p style={{ margin: '0', color: '#721c24', fontSize: '16px' }}>
                No matching person found in the reference images
              </p>
              <p style={{ margin: '10px 0 0 0', color: '#721c24', fontSize: '14px' }}>
                Required similarity: {similarityThreshold}%
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      <div style={{ padding: '15px', backgroundColor: '#e2e3e5', borderRadius: '5px', fontSize: '14px' }}>
        <h5>💡 Tips for Better Results:</h5>
        <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
          <li>Use high-quality reference images with clear face visibility</li>
          <li>Ensure reference images have similar lighting to liveness detection</li>
          <li>Name files as "personId_PersonName.jpg" for automatic identification</li>
          <li>Lower similarity threshold if getting false negatives</li>
          <li>Higher similarity threshold for stricter security</li>
        </ul>
      </div>
    </div>
  );
}
