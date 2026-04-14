import cloudinary from "../config/cloudinary.js";

/**
 * @desc    Generate a signature for direct Cloudinary upload
 * @route   GET /api/admin/cloudinary-signature
 */
export const getCloudinarySignature = async (req, res) => {
  console.log(`[CLOUDINARY] Signature request from user: ${req.user.email} (Role: ${req.user.role})`);
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    // Use a unique public_id or let Cloudinary generate one
    const folder = req.query.folder || "academy_videos";
    
    // Parameters to sign (must match exactly what client sends)
    const paramsToSign = {
      timestamp: timestamp,
      folder: folder,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    res.status(200).json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder,
    });
  } catch (err) {
    console.error("Cloudinary Signature Error:", err);
    res.status(500).json({ 
      message: "Failed to generate upload signature",
      error: err.message 
    });
  }
};
