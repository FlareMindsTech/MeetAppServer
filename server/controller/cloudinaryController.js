export const uploadMedia = async (req, res) => {
  try {
    const file = req.file; 
    
    if (!file) {
      return res.status(400).json({ message: "No file provided" });
    }

    res.status(200).json({
      message: "File uploaded successfully",
      url: file.path,
      fileName: file.originalname
    });

  } catch (err) {
    res.status(500).json({ 
      message: "Failed to upload file to Cloudinary",
      error: err.message 
    });
  }
};
