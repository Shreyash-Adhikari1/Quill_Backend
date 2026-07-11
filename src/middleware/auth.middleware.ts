import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import dotenv from "dotenv"
import logger from "../utils/logger";
import { UserModel } from "../features/user/model/user.model";
import { requireJwtSecret } from "../utils/security";

// if app-lication is a club
// A middleware acts as a bouncer between requests and controller
// meaning only authorized requests are sent to the controller to get response
// unauthorixed requests are those which dont have a valid auuth header attached to it

dotenv.config();

interface JwtPayload{
    id: string;
    role: string;
    sessionVersion?: number;
};

export const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
)=>{
    // Reads the JWT from an httpOnly cookie instead of Authorization headers so frontend JavaScript never stores the token in localStorage.
    // This blocks XSS token theft because document.cookie cannot read httpOnly cookies.
    const token = req.cookies?.token;
    if (!token) {
        // Logs unauthorized access attempts without storing tokens or request bodies.
        logger.warn("Unauthorized access attempt", { ip: req.ip, path: req.path, method: req.method });
        return res.status(401).json({message: "Authentication required"})
    };

    try {
        const decoded =jwt.verify( // this is the verification bit
            token,
            requireJwtSecret()
        )as JwtPayload;

        // Session version checking lets logout and password changes invalidate already-issued JWTs.
        UserModel.findById(decoded.id)
            .then((user) => {
                if (!user || (user.sessionVersion || 0) !== (decoded.sessionVersion || 0)) {
                    logger.warn("Unauthorized access attempt", { ip: req.ip, path: req.path, method: req.method, reason: "stale_session" });
                    return res.status(401).json({ message: "Invalid or expired token" });
                }

                (req as any).user = decoded;
                next(); // if verified , goes to the next step [getting the response through the controller]
            })
            .catch(() => res.status(401).json({ message: "Invalid or expired token" }));
    } catch (error) {
        // Logs invalid or expired tokens as authentication failures without exposing token contents.
        logger.warn("Unauthorized access attempt", { ip: req.ip, path: req.path, method: req.method, reason: "invalid_or_expired_token" });
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
