import boto3
from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import base64

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Initialize AWS Rekognition client
session = boto3.Session(profile_name='default') 
client = session.client('rekognition')

def create_session():
    """Create a new Face Liveness session"""
    try:
        response = client.create_face_liveness_session()
        session_id = response.get("SessionId")
        print('SessionId: ' + session_id)
        return session_id
    except Exception as e:
        print(f"Error creating session: {e}")
        raise

def get_session_results(session_id):
    """Get the results of a Face Liveness session with complete face detection data"""
    try:
        response = client.get_face_liveness_session_results(SessionId=session_id)
        
        confidence = response.get("Confidence")
        status = response.get("Status")
        session_id_response = response.get("SessionId")
        
        # Handle case where confidence might be None (session not completed)
        if confidence is not None:
            print('Confidence: ' + "{:.2f}".format(confidence) + "%")
        else:
            print('Confidence: Not available (session may not be completed)')
        print('Status: ' + str(status))
        
        # Extract face detection data
        reference_image = response.get("ReferenceImage")
        audit_images = response.get("AuditImages", [])
        challenge = response.get("Challenge")
        
        # Process reference image
        reference_image_data = None
        if reference_image:
            reference_image_data = {
                "BoundingBox": reference_image.get("BoundingBox", {}),
                "Bytes": reference_image.get("Bytes"),  # Base64-encoded image
                "S3Object": reference_image.get("S3Object")
            }
            # Convert bytes to base64 string if present
            if reference_image_data["Bytes"]:
                import base64
                reference_image_data["Bytes"] = base64.b64encode(reference_image_data["Bytes"]).decode('utf-8')
            
            print(f"Reference image available with bounding box: {reference_image_data['BoundingBox']}")
        
        # Process audit images
        audit_images_data = []
        for i, audit_image in enumerate(audit_images):
            audit_data = {
                "BoundingBox": audit_image.get("BoundingBox", {}),
                "Bytes": audit_image.get("Bytes"),
                "S3Object": audit_image.get("S3Object")
            }
            # Convert bytes to base64 string if present
            if audit_data["Bytes"]:
                import base64
                audit_data["Bytes"] = base64.b64encode(audit_data["Bytes"]).decode('utf-8')
            
            audit_images_data.append(audit_data)
            print(f"Audit image {i+1} available with bounding box: {audit_data['BoundingBox']}")
        
        # Process challenge information
        challenge_data = None
        if challenge:
            challenge_data = {
                "Type": challenge.get("Type"),
                "Version": challenge.get("Version")
            }
            print(f"Challenge: {challenge_data}")
        
        is_live = status == "SUCCEEDED" and confidence is not None and confidence > 80  # Adjust threshold as needed
        
        print(f"Total audit images: {len(audit_images_data)}")
        print(f"Reference image available: {reference_image_data is not None}")
        
        return {
            "sessionId": session_id_response,
            "status": status,
            "confidence": confidence,
            "isLive": is_live,
            "referenceImage": reference_image_data,
            "auditImages": audit_images_data,
            "challenge": challenge_data
        }
    except Exception as e:
        print(f"Error getting session results: {e}")
        raise

def compare_faces(source_image_base64, target_image_base64, similarity_threshold=80):
    """Compare two faces using AWS Rekognition CompareFaces API"""
    try:
        # Convert base64 strings to bytes
        source_image_bytes = base64.b64decode(source_image_base64)
        target_image_bytes = base64.b64decode(target_image_base64)
        
        print(f"Comparing faces with similarity threshold: {similarity_threshold}%")
        
        # Call AWS Rekognition CompareFaces
        response = client.compare_faces(
            SimilarityThreshold=similarity_threshold,
            SourceImage={'Bytes': source_image_bytes},
            TargetImage={'Bytes': target_image_bytes}
        )
        
        # Extract face matches
        face_matches = response.get('FaceMatches', [])
        unmatched_faces = response.get('UnmatchedFaces', [])
        source_image_face = response.get('SourceImageFace', {})
        
        print(f"Found {len(face_matches)} face matches")
        print(f"Found {len(unmatched_faces)} unmatched faces")
        
        # Log match details
        for i, match in enumerate(face_matches):
            similarity = match.get('Similarity', 0)
            confidence = match.get('Face', {}).get('Confidence', 0)
            print(f"Match {i+1}: Similarity={similarity:.2f}%, Confidence={confidence:.2f}%")
        
        return {
            "matches": face_matches,
            "unmatchedFaces": unmatched_faces,
            "sourceImageFace": source_image_face,
            "totalMatches": len(face_matches)
        }
        
    except Exception as e:
        print(f"Error comparing faces: {e}")
        raise

@app.route('/api/create-liveness-session', methods=['POST'])
def create_liveness_session():
    """API endpoint to create a new Face Liveness session"""
    try:
        session_id = create_session()
        return jsonify({
            "sessionId": session_id,
            "success": True
        })
    except Exception as e:
        return jsonify({
            "error": str(e),
            "success": False
        }), 500

@app.route('/api/get-liveness-results', methods=['GET'])
def get_liveness_results():
    """API endpoint to get Face Liveness session results with complete face detection data"""
    try:
        session_id = request.args.get('sessionId')
        if not session_id:
            return jsonify({
                "error": "sessionId parameter is required",
                "success": False
            }), 400
        
        results = get_session_results(session_id)
        
        # Return complete results including face detection data
        return jsonify({
            "success": True,
            "sessionId": results["sessionId"],
            "status": results["status"],
            "confidence": results["confidence"],
            "isLive": results["isLive"],
            "referenceImage": results["referenceImage"],
            "auditImages": results["auditImages"],
            "challenge": results["challenge"]
        })
    except Exception as e:
        return jsonify({
            "error": str(e),
            "success": False
        }), 500

@app.route('/api/compare-faces', methods=['POST'])
def compare_faces_api():
    """API endpoint to compare two faces using AWS Rekognition"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "error": "No JSON data provided",
                "success": False
            }), 400
        
        source_image = data.get('sourceImage')
        target_image = data.get('targetImage')
        similarity_threshold = data.get('similarityThreshold', 80)
        
        if not source_image or not target_image:
            return jsonify({
                "error": "Both sourceImage and targetImage are required",
                "success": False
            }), 400
        
        # Validate similarity threshold
        if not isinstance(similarity_threshold, (int, float)) or similarity_threshold < 0 or similarity_threshold > 100:
            return jsonify({
                "error": "similarityThreshold must be a number between 0 and 100",
                "success": False
            }), 400
        
        # Compare faces
        results = compare_faces(source_image, target_image, similarity_threshold)
        
        return jsonify({
            "success": True,
            "matches": results["matches"],
            "unmatchedFaces": results["unmatchedFaces"],
            "sourceImageFace": results["sourceImageFace"],
            "totalMatches": results["totalMatches"],
            "similarityThreshold": similarity_threshold
        })
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "success": False
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

def main():
    """Main function for testing"""
    session_id = create_session()
    print('Created a Face Liveness Session with ID: ' + session_id)
    
    # Note: In a real scenario, you would wait for the liveness check to complete
    # before calling get_session_results
    # status = get_session_results(session_id)
    # print('Status of Face Liveness Session: ' + status)

if __name__ == "__main__":
    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)
