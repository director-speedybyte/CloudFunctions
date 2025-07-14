const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// Create an HTTP server explicitly
const http = require('http');
const server = http.createServer(async (req, res) => {
  // Handle CORS if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.end();
  }

  // Your existing function logic
  if (req.url === '/userConfig' || req.url === '/userConfig/') {
    return await handleUserConfigRequest(req, res);
  }

  res.statusCode = 404;
  res.end('Not Found');
});

// Move your existing logic to a separate function
async function handleUserConfigRequest(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const idToken = authHeader.split("Bearer ")[1];

  let uid;
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Parse request body for POST/PATCH methods
  let body = '';
  if (req.method === 'POST' || req.method === 'PATCH') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
    });
  }

  const role = req.url.split('?')[1]?.split('&').find(p => p.startsWith('role='))?.split('=')[1] || 
               (body ? JSON.parse(body).role : null);
  
  if (!role) return res.status(400).json({ error: "Missing 'role' in query or body." });

  const docRef = db.collection(role).doc(uid);

  try {
    if (req.method === "POST") {
      const { firstName, lastName, phoneNumber, email, password } = JSON.parse(body);
      const data = {
        firstName,
        lastName,
        phoneNumber,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(email ? { email } : { password }),
      };
      await docRef.set(data);
      return res.status(200).json({ success: true, message: "Created successfully." });

    } else if (req.method === "GET") {
      const snapshot = await docRef.get();
      if (!snapshot.exists) return res.status(404).json({ error: "User config not found." });
      return res.status(200).json(snapshot.data());

    } else if (req.method === "PATCH") {
      const { firstName, lastName, phoneNumber, email, password } = JSON.parse(body);
      const updateData = {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber && { phoneNumber }),
        ...(email ? { email } : (password ? { password } : {})),
      };
      await docRef.update(updateData);
      return res.status(200).json({ success: true, message: "Updated successfully." });

    } else if (req.method === "DELETE") {
      await docRef.delete();
      return res.status(200).json({ success: true, message: "Deleted successfully." });

    } else {
      return res.status(405).json({ error: "Method Not Allowed." });
    }
  } catch (error) {
    console.error("Firestore Error:", error);
    return res.status(500).json({ error: "Operation failed." });
  }
}

// Start the server on the correct port
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export the server as a Cloud Function
exports.userConfig = functions.https.onRequest(async (req, res) => {
  // This will still work for Firebase Functions
  await handleUserConfigRequest(req, res);
});