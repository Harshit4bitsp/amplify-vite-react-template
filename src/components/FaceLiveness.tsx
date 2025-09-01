import React from 'react';
import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness';
import { Loader, ThemeProvider, Authenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { 
  getFaceQualityScore, 
  base64ToDataUrl,
  extractFaceRegion,
  createFaceDetectionCanvas
} from '../utils/faceDetectionUtils';
import { FaceIdentification } from './FaceIdentification';

// Interface for face detection data
interface BoundingBox {
  Height: number;
  Left: number;
  Top: number;
  Width: number;
}

interface AuditImage {
  BoundingBox: BoundingBox;
  Bytes?: string; // Base64-encoded image
  S3Object?: {
    Bucket: string;
    Name: string;
    Version: string;
  };
}

interface Challenge {
  Type: string;
  Version: string;
}

interface LivenessResults {
  success: boolean;
  status: string;
  confidence: number;
  isLive: boolean;
  sessionId: string;
  auditImages?: AuditImage[];
  referenceImage?: AuditImage;
  challenge?: Challenge;
  error?: string;
}

export function LivenessQuickStartReact() {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createLivenessApiData, setCreateLivenessApiData] = React.useState<{
    sessionId: string;
  } | null>(null);
  const [livenessResults, setLivenessResults] = React.useState<LivenessResults | null>(null);
  const [identificationReport, setIdentificationReport] = React.useState<any>(null);
  const [showIdentification, setShowIdentification] = React.useState(false);

  const checkCameraPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('✅ Camera permission granted');
      stream.getTracks().forEach(track => track.stop()); // Stop the stream
      return true;
    } catch (error) {
      console.error('❌ Camera permission denied:', error);
      setError('Camera permission is required for face liveness detection. Please allow camera access and try again.');
      return false;
    }
  };

  const refreshCredentials = async () => {
    try {
      console.log('🔄 Refreshing AWS credentials...');
      // Clear any cached credentials and force a refresh
      const session = await fetchAuthSession({ forceRefresh: true });
      console.log('✅ Credentials refreshed:', {
        identityId: session.identityId,
        hasTokens: !!session.tokens,
        hasCredentials: !!session.credentials
      });
      return true;
    } catch (error) {
      console.error('❌ Failed to refresh credentials:', error);
      return false;
    }
  };

  const fetchCreateLiveness = async () => {
    /*
     * Call the real backend API to create a Face Liveness session
     */
    try {
      const response = await fetch('https://bafbe018b260.ngrok-free.app/api/create-liveness-session', { //5000
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      });

      
      const data = await response.json();
      console.log('Data from create-liveness-session:', data);

      if (data.success) {
        console.log('Session created successfully:', data.sessionId);
        setCreateLivenessApiData({ sessionId: data.sessionId });
        setLoading(false);
      } else {
        throw new Error(data.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Error creating liveness session:', error);
      setLoading(false);
      setError('Failed to create liveness session. Please try again.');
    }
  };

  React.useEffect(() => {
    // Reset retry count when component mounts
    retryCount.current = 0;
    
    // Check camera permissions first
    const initializeLiveness = async () => {
      const hasCamera = await checkCameraPermissions();
      if (hasCamera) {
        fetchCreateLiveness();
      }
    };
    
    initializeLiveness();
  }, []);

  const handleAnalysisComplete: () => Promise<void> = async () => {
    /*
     * Call the real backend API to get Face Liveness session results
     */
    if (createLivenessApiData?.sessionId) {
      try {
        const response = await fetch(
          `https://bafbe018b260.ngrok-free.app/api/get-liveness-results?sessionId=${createLivenessApiData.sessionId}`, //5000
          {
            headers: {
              'ngrok-skip-browser-warning': 'true',
            },
          }
        );
        const data: LivenessResults = await response.json();

        if (data.success) {
          // Store the complete results for face detection processing
          setLivenessResults(data);

          /*
           * Handle the liveness results based on your business logic
           */
          console.log('=== LIVENESS SESSION RESULTS ===');
          console.log('Session ID:', data.sessionId);
          console.log('Status:', data.status);
          console.log('Confidence:', data.confidence);
          console.log('Is Live:', data.isLive);
          
          // Process face detection data
          if (data.referenceImage) {
            console.log('=== REFERENCE IMAGE (Face Detection) ===');
            console.log('Face Bounding Box:', data.referenceImage.BoundingBox);
            console.log('Face Quality Score:', getFaceQualityScore(data.referenceImage.BoundingBox));
            console.log('Reference Image Available:', !!data.referenceImage.Bytes || !!data.referenceImage.S3Object);
            
            // You can use the reference image for face comparison or search
            if (data.referenceImage.Bytes) {
              console.log('Reference image as Base64 available for face detection');
              // Process the base64 image for face detection/comparison
              processReferenceImageForFaceDetection(data.referenceImage);
            } else if (data.referenceImage.S3Object) {
              console.log('Reference image stored in S3:', data.referenceImage.S3Object);
              // Download from S3 for face detection if needed
            }
          }

          // Process audit images for additional face detection
          if (data.auditImages && data.auditImages.length > 0) {
            console.log('=== AUDIT IMAGES (Face Detection) ===');
            console.log(`Number of audit images: ${data.auditImages.length}`);
            
            data.auditImages.forEach((auditImage, index) => {
              const qualityScore = getFaceQualityScore(auditImage.BoundingBox);
              console.log(`Audit Image ${index + 1}:`, {
                boundingBox: auditImage.BoundingBox,
                qualityScore: qualityScore,
                hasBytes: !!auditImage.Bytes,
                s3Object: auditImage.S3Object
              });
              
              // Process each audit image for face detection
              if (auditImage.Bytes) {
                processAuditImageForFaceDetection(auditImage, index);
              }
            });
          }

          // Challenge information
          if (data.challenge) {
            console.log('=== CHALLENGE INFO ===');
            console.log('Challenge Type:', data.challenge.Type);
            console.log('Challenge Version:', data.challenge.Version);
          }

          // Log analysis results
          console.log('=== FACE DETECTION ANALYSIS ===');
          
          if (data.isLive) {
            console.log('✅ User is live - Authentication successful');
            console.log('🔍 Face detection data available for further processing');
            // Proceed with authenticated user flow
            // You can now use the face detection data for:
            // - Face comparison with stored user images
            // - Face search in your database
            // - Additional security checks
          } else {
            console.log('❌ User is not live - Authentication failed');
            // Handle failed authentication
          }
        } else {
          console.error('Error getting session results:', data.error);
          setError('Failed to get liveness results. Please try again.');
        }
      } catch (error) {
        console.error('Error fetching session results:', error);
        setError('Error processing liveness results. Please try again.');
      }
    }
  };

  // Helper function to process reference image for face detection
  const processReferenceImageForFaceDetection = (referenceImage: AuditImage) => {
    console.log('Processing reference image for face detection...');
    
    // Extract face bounding box coordinates
    const { Height, Left, Top, Width } = referenceImage.BoundingBox;
    console.log(`Face detected at: Left=${Left}, Top=${Top}, Width=${Width}, Height=${Height}`);
    
    // The bounding box coordinates are normalized (0-1 range)
    // You can use these to crop the face from the image or draw a rectangle
    
    if (referenceImage.Bytes) {
      // Create data URL for the image
      const imageDataUrl = base64ToDataUrl(referenceImage.Bytes);
      console.log('Reference image ready for face comparison/search');
      
      // Here you could:
      // 1. Send the image to your face comparison API
      // 2. Store it for future reference
      // 3. Use it for face search in your database
      // 4. Display it in the UI for verification
      
      // Example: Extract just the face region for better processing
      extractFaceRegion(imageDataUrl, referenceImage.BoundingBox, 0.1)
        .then((croppedFaceUrl) => {
          console.log('Cropped face region extracted for processing:', croppedFaceUrl.substring(0, 50) + '...');
          // Use croppedFaceUrl for face recognition APIs
        })
        .catch((error) => {
          console.error('Error extracting face region:', error);
        });
    }
  };

  // Helper function to process audit images for face detection
  const processAuditImageForFaceDetection = (auditImage: AuditImage, index: number) => {
    console.log(`Processing audit image ${index + 1} for face detection...`);
    
    const { Height, Left, Top, Width } = auditImage.BoundingBox;
    console.log(`Face detected in audit image ${index + 1}: Left=${Left}, Top=${Top}, Width=${Width}, Height=${Height}`);
    
    if (auditImage.Bytes) {
      const imageDataUrl = base64ToDataUrl(auditImage.Bytes);
      console.log(`Audit image ${index + 1} ready for analysis`);
      
      // You can use audit images for:
      // 1. Quality assessment
      // 2. Multiple angle face detection
      // 3. Fraud detection
      // 4. Compliance and audit purposes
      
      // Example: Create a canvas with face detection overlay
      createFaceDetectionCanvas(imageDataUrl, auditImage.BoundingBox, {
        strokeColor: '#ff0000',
        strokeWidth: 2,
        showLabel: true,
        labelText: `Audit ${index + 1}`
      }).then((canvas) => {
        console.log(`Face detection overlay created for audit image ${index + 1}, canvas size: ${canvas.width}x${canvas.height}`);
        // You could append this canvas to the DOM or save it
      }).catch((error) => {
        console.error(`Error creating face detection overlay for audit image ${index + 1}:`, error);
      });
    }
  };

  // Use a ref to track if we're currently handling an error and retry count
  const isHandlingError = React.useRef(false);
  const retryCount = React.useRef(0);
  const MAX_RETRIES = 2;

  const handleError = async (error: any) => {
    console.error('Liveness error:', error);
    console.error('Error type:', typeof error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    // Log more specific error information
    if (error && error.message) {
      console.error('Error message:', error.message);
    }
    if (error && error.code) {
      console.error('Error code:', error.code);
    }
    if (error && error.name) {
      console.error('Error name:', error.name);
    }

    // Prevent infinite loop - limit retries
    if (isHandlingError.current || retryCount.current >= MAX_RETRIES) {
      console.error('Max retries reached or already handling error. Stopping retry attempts.');
      setLoading(false);
      const errorMessage = error?.message || error?.code || 'Unknown error';
      setError(`Face liveness detection failed after multiple attempts. Error: ${errorMessage}. Please refresh the page to try again.`);
      return;
    }

    isHandlingError.current = true;
    retryCount.current += 1;
    setLoading(true);

    console.log(`Retry attempt ${retryCount.current}/${MAX_RETRIES}`);

    // Wait a bit before retrying to avoid rapid requests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create a new session for retry - sessions are single-use
    await fetchCreateLiveness();

    // Reset error handling flag
    isHandlingError.current = false;
  };

  const retryLiveness = () => {
    retryCount.current = 0;
    setError(null);
    setLivenessResults(null);
    setIdentificationReport(null);
    setShowIdentification(false);
    setLoading(true);
    fetchCreateLiveness();
  };

  const handleIdentificationComplete = (report: any) => {
    setIdentificationReport(report);
    console.log('🎯 Face Identification Complete:', report);
  };

  return (
    <ThemeProvider>
      {error ? (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ color: 'red', marginBottom: '20px' }}>{error}</p>
          <button onClick={retryLiveness} style={{ padding: '10px 20px', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      ) : loading ? (
        <Loader />
      ) : livenessResults ? (
        // Show results after successful liveness detection
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
          <h2>Liveness Detection Results</h2>
          
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: livenessResults.isLive ? '#d4edda' : '#f8d7da', borderRadius: '5px' }}>
            <h3>Status: {livenessResults.isLive ? '✅ Live Person Detected' : '❌ Not Live'}</h3>
            <p><strong>Confidence:</strong> {livenessResults.confidence}%</p>
            <p><strong>Session Status:</strong> {livenessResults.status}</p>
            <p><strong>Session ID:</strong> {livenessResults.sessionId}</p>
          </div>

          {/* Reference Image Section */}
          {livenessResults.referenceImage && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
              <h4>📸 Reference Image</h4>
              
              {livenessResults.referenceImage.Bytes && (
                <div style={{ marginTop: '10px' }}>
                  <p><strong>Reference Image:</strong></p>
                  <img 
                    src={`data:image/jpeg;base64,${livenessResults.referenceImage.Bytes}`}
                    alt="Reference face"
                    style={{ 
                      maxWidth: '300px', 
                      maxHeight: '300px', 
                      border: '2px solid #007bff',
                      borderRadius: '8px'
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    This image can be used for face comparison and search
                  </p>
                </div>
              )}

              {livenessResults.referenceImage.S3Object && (
                <div style={{ marginTop: '10px' }}>
                  <p><strong>S3 Storage:</strong></p>
                  <p>Bucket: {livenessResults.referenceImage.S3Object.Bucket}</p>
                  <p>Key: {livenessResults.referenceImage.S3Object.Name}</p>
                </div>
              )}
            </div>
          )}

          {/* Audit Images Section */}
          {livenessResults.auditImages && livenessResults.auditImages.length > 0 && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
              <h4>🔍 Audit Images ({livenessResults.auditImages.length} images)</h4>
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
                Additional images captured during liveness detection for audit and quality assessment
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                {livenessResults.auditImages.map((auditImage, index) => (
                  <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '10px' }}>
                    <h5>Audit Image {index + 1}</h5>
                    
                    {auditImage.Bytes && (
                      <img 
                        src={`data:image/jpeg;base64,${auditImage.Bytes}`}
                        alt={`Audit face ${index + 1}`}
                        style={{ 
                          width: '100%', 
                          maxHeight: '150px', 
                          objectFit: 'cover',
                          borderRadius: '4px'
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Challenge Information */}
          {livenessResults.challenge && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
              <h4>🎯 Challenge Information</h4>
              <p><strong>Type:</strong> {livenessResults.challenge.Type}</p>
              <p><strong>Version:</strong> {livenessResults.challenge.Version}</p>
            </div>
          )}

          {/* Face Identification Section */}
          {livenessResults.isLive && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e8f5e8', borderRadius: '5px', border: '1px solid #28a745' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4>🆔 Face Identification</h4>
                <button
                  onClick={() => setShowIdentification(!showIdentification)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: showIdentification ? '#6c757d' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {showIdentification ? 'Hide Identification' : 'Identify Person'}
                </button>
              </div>
              
              {showIdentification ? (
                <FaceIdentification 
                  livenessResult={livenessResults}
                  onIdentificationComplete={handleIdentificationComplete}
                />
              ) : (
                <div>
                  <p style={{ margin: '0', color: '#155724' }}>
                    Liveness verification successful! Click "Identify Person" to compare with your reference database.
                  </p>
                  {identificationReport && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
                      <p style={{ margin: '0', fontWeight: 'bold' }}>
                        Latest Identification: {identificationReport.recommendation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '30px' }}>
            <button 
              onClick={() => {
                setLivenessResults(null);
                setShowIdentification(false);
                setIdentificationReport(null);
                retryLiveness();
              }}
              style={{ 
                padding: '12px 24px', 
                backgroundColor: '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Start New Liveness Check
            </button>
          </div>
        </div>
      ) : (
        <Authenticator>
          {({ signOut, user }) => (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#f8f9fa', marginBottom: '10px', borderRadius: '5px' }}>
                <div>
                  <p style={{ margin: '0', fontWeight: 'bold' }}>Welcome, {user?.username}!</p>
                  <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>You are authenticated and ready for face liveness detection</p>
                </div>
                <button onClick={signOut} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>
                  Sign out
                </button>
              </div>
              
              <div style={{ padding: '10px', backgroundColor: '#d1ecf1', marginBottom: '10px', borderRadius: '5px' }}>
                <p><strong>Debug Info:</strong></p>
                <p>Session ID: {createLivenessApiData?.sessionId}</p>
                <p>Region: ap-south-1</p>
                <p>Authenticated User: {user?.username}</p>
                <button 
                  onClick={checkCameraPermissions}
                  style={{ padding: '5px 10px', marginRight: '10px', cursor: 'pointer' }}
                >
                  Test Camera
                </button>
              </div>
              
              <FaceLivenessDetector
                sessionId={createLivenessApiData?.sessionId || ''}
                region="ap-south-1"
                onAnalysisComplete={handleAnalysisComplete}
                onError={handleError}
              />
            </div>
          )}
        </Authenticator>
      )}
    </ThemeProvider>
  );
}
