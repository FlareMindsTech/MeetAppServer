const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs"); 
const User = require("../Model/userSchema");


// REGISTER (only normal users)
exports.register = async (req, res) => {
  try {
    const { FirstName,LastName,phoneNumber, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    const newUser = new User({
      FirstName,LastName,phoneNumber,
      email,
      password,
      role
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      "secret123",
      { expiresIn: "1h" }
    );

    res.status(201).json({ message: "User registered", user: newUser, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// LOGIN 
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // 2️⃣ Check normal users in DB
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      "secret123",
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      message: "Login successful",
      user,
      token
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
