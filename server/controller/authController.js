const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs"); 
const User = require("../Model/userSchema");

// Hardcoded Admins
const UserOwner = [
  {
    userName: "Akash",
    email: "rajanaksh331@gmail.com",
    password: "123456", 
    role: "owner"
  },
  {
    userName: "Prakash",
    email: "rajanaksh@gmail.com",
    password: "123456",
    role: "owner"
  }
];

// REGISTER (only normal users)
exports.register = async (req, res) => {
  try {
    const { FirstName,LastName, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    const newUser = new User({
      FirstName,LastName,
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
    const owner = UserOwner.find(
      u => u.email === email && u.password === password
    );
    if (owner) {
      const token = jwt.sign(
        { email: owner.email, role: owner.role },
        "secret123",
        { expiresIn: "1h" }
      );

      return res.status(200).json({
        message: "owner login successful",
        user: owner,
        token
      });
    }
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
