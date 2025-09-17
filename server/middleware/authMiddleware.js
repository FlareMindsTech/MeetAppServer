const jwt=require('jsonwebtoken')


function auth(req,res,next){
    const token=req.header("Authorization")?.split("")[1];
    if(!token)return res.status(401).json({message:"NO token,authorization denied"});
    try{
        const decode=jwt.verify(token,process.env.JWT_SECRET);
        req.user=decode;
        next();
    }catch(err){
        res.status(400).json({message:"Invalid token"});
    }
}
module.exports=auth;