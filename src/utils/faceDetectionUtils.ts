/**
 * Utility functions for processing face detection data from AWS Rekognition Face Liveness
 */

export interface BoundingBox {
  Height: number;
  Left: number;
  Top: number;
  Width: number;
}

export interface FaceImage {
  BoundingBox: BoundingBox;
  Bytes?: string; // Base64-encoded image
  S3Object?: {
    Bucket: string;
    Name: string;
    Version: string;
  };
}

/**
 * Convert normalized bounding box coordinates to pixel coordinates
 * @param boundingBox - Normalized bounding box (0-1 range)
 * @param imageWidth - Original image width in pixels
 * @param imageHeight - Original image height in pixels
 * @returns Pixel coordinates
 */
export function normalizedToPixelCoords(
  boundingBox: BoundingBox,
  imageWidth: number,
  imageHeight: number
) {
  return {
    left: Math.round(boundingBox.Left * imageWidth),
    top: Math.round(boundingBox.Top * imageHeight),
    width: Math.round(boundingBox.Width * imageWidth),
    height: Math.round(boundingBox.Height * imageHeight),
  };
}

/**
 * Calculate the area of a bounding box
 * @param boundingBox - The bounding box
 * @returns Area as a percentage (0-1 range)
 */
export function calculateBoundingBoxArea(boundingBox: BoundingBox): number {
  return boundingBox.Width * boundingBox.Height;
}

/**
 * Check if the face is centered in the image
 * @param boundingBox - The face bounding box
 * @param tolerance - Tolerance for center detection (default: 0.2)
 * @returns True if face is centered
 */
export function isFaceCentered(boundingBox: BoundingBox, tolerance: number = 0.2): boolean {
  const centerX = boundingBox.Left + boundingBox.Width / 2;
  const centerY = boundingBox.Top + boundingBox.Height / 2;
  
  return (
    Math.abs(centerX - 0.5) <= tolerance &&
    Math.abs(centerY - 0.5) <= tolerance
  );
}

/**
 * Get face quality score based on size and position
 * @param boundingBox - The face bounding box
 * @returns Quality score from 0-100
 */
export function getFaceQualityScore(boundingBox: BoundingBox): number {
  const area = calculateBoundingBoxArea(boundingBox);
  const isCentered = isFaceCentered(boundingBox, 0.15);
  
  // Base score from face size (larger faces get higher scores)
  let score = Math.min(area * 400, 70); // Max 70 points for size
  
  // Bonus for centered faces
  if (isCentered) {
    score += 20;
  }
  
  // Bonus for good size (not too small, not too large)
  if (area >= 0.1 && area <= 0.4) {
    score += 10;
  }
  
  return Math.min(Math.round(score), 100);
}

/**
 * Convert base64 image to data URL
 * @param base64Image - Base64 encoded image string
 * @param mimeType - Image MIME type (default: image/jpeg)
 * @returns Data URL string
 */
export function base64ToDataUrl(base64Image: string, mimeType: string = 'image/jpeg'): string {
  return `data:${mimeType};base64,${base64Image}`;
}

/**
 * Create a canvas element with face bounding box drawn
 * @param imageUrl - Image URL or data URL
 * @param boundingBox - Face bounding box
 * @param options - Drawing options
 * @returns Promise<HTMLCanvasElement>
 */
export function createFaceDetectionCanvas(
  imageUrl: string,
  boundingBox: BoundingBox,
  options: {
    strokeColor?: string;
    strokeWidth?: number;
    showLabel?: boolean;
    labelText?: string;
  } = {}
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the image
      ctx.drawImage(img, 0, 0);
      
      // Convert normalized coordinates to pixels
      const pixelCoords = normalizedToPixelCoords(boundingBox, img.width, img.height);
      
      // Draw bounding box
      ctx.strokeStyle = options.strokeColor || '#00ff00';
      ctx.lineWidth = options.strokeWidth || 3;
      ctx.strokeRect(pixelCoords.left, pixelCoords.top, pixelCoords.width, pixelCoords.height);
      
      // Draw label if requested
      if (options.showLabel && options.labelText) {
        ctx.fillStyle = options.strokeColor || '#00ff00';
        ctx.font = '16px Arial';
        ctx.fillText(
          options.labelText,
          pixelCoords.left,
          pixelCoords.top - 5
        );
      }
      
      resolve(canvas);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUrl;
  });
}

/**
 * Extract face region from image using bounding box
 * @param imageUrl - Image URL or data URL
 * @param boundingBox - Face bounding box
 * @param padding - Additional padding around face (default: 0.1)
 * @returns Promise<string> - Data URL of cropped face
 */
export function extractFaceRegion(
  imageUrl: string,
  boundingBox: BoundingBox,
  padding: number = 0.1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Calculate crop area with padding
      const paddedLeft = Math.max(0, boundingBox.Left - padding);
      const paddedTop = Math.max(0, boundingBox.Top - padding);
      const paddedWidth = Math.min(1 - paddedLeft, boundingBox.Width + padding * 2);
      const paddedHeight = Math.min(1 - paddedTop, boundingBox.Height + padding * 2);
      
      // Convert to pixel coordinates
      const pixelCoords = normalizedToPixelCoords(
        { Left: paddedLeft, Top: paddedTop, Width: paddedWidth, Height: paddedHeight },
        img.width,
        img.height
      );
      
      canvas.width = pixelCoords.width;
      canvas.height = pixelCoords.height;
      
      // Draw cropped face
      ctx.drawImage(
        img,
        pixelCoords.left,
        pixelCoords.top,
        pixelCoords.width,
        pixelCoords.height,
        0,
        0,
        pixelCoords.width,
        pixelCoords.height
      );
      
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUrl;
  });
}

/**
 * Compare two face bounding boxes to determine similarity
 * @param box1 - First bounding box
 * @param box2 - Second bounding box
 * @returns Similarity score from 0-1
 */
export function compareFaceBoundingBoxes(box1: BoundingBox, box2: BoundingBox): number {
  // Calculate overlap (Intersection over Union)
  const left = Math.max(box1.Left, box2.Left);
  const top = Math.max(box1.Top, box2.Top);
  const right = Math.min(box1.Left + box1.Width, box2.Left + box2.Width);
  const bottom = Math.min(box1.Top + box1.Height, box2.Top + box2.Height);
  
  if (left >= right || top >= bottom) {
    return 0; // No overlap
  }
  
  const intersection = (right - left) * (bottom - top);
  const area1 = box1.Width * box1.Height;
  const area2 = box2.Width * box2.Height;
  const union = area1 + area2 - intersection;
  
  return intersection / union;
}

/**
 * Analyze face detection results for quality and consistency
 * @param referenceImage - Reference image with face
 * @param auditImages - Array of audit images
 * @returns Analysis results
 */
export function analyzeFaceDetectionResults(
  referenceImage: FaceImage | null,
  auditImages: FaceImage[]
) {
  const analysis = {
    hasReferenceImage: !!referenceImage,
    auditImageCount: auditImages.length,
    averageQualityScore: 0,
    consistencyScore: 0,
    recommendations: [] as string[],
  };
  
  if (!referenceImage) {
    analysis.recommendations.push('No reference image available');
    return analysis;
  }
  
  // Calculate quality scores
  const qualityScores = [getFaceQualityScore(referenceImage.BoundingBox)];
  auditImages.forEach(img => {
    qualityScores.push(getFaceQualityScore(img.BoundingBox));
  });
  
  analysis.averageQualityScore = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
  
  // Calculate consistency
  if (auditImages.length > 0) {
    const similarities = auditImages.map(img => 
      compareFaceBoundingBoxes(referenceImage.BoundingBox, img.BoundingBox)
    );
    analysis.consistencyScore = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  }
  
  // Generate recommendations
  if (analysis.averageQualityScore < 70) {
    analysis.recommendations.push('Consider retaking - face quality could be improved');
  }
  if (analysis.consistencyScore < 0.7 && auditImages.length > 0) {
    analysis.recommendations.push('Inconsistent face detection across images');
  }
  if (!isFaceCentered(referenceImage.BoundingBox)) {
    analysis.recommendations.push('Face should be more centered in the frame');
  }
  if (calculateBoundingBoxArea(referenceImage.BoundingBox) < 0.1) {
    analysis.recommendations.push('Face appears too small - move closer to camera');
  }
  if (calculateBoundingBoxArea(referenceImage.BoundingBox) > 0.5) {
    analysis.recommendations.push('Face appears too large - move away from camera');
  }
  
  if (analysis.recommendations.length === 0) {
    analysis.recommendations.push('Face detection quality is good');
  }
  
  return analysis;
}
