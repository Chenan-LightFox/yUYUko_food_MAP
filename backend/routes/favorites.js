const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

// All favorites routes require authentication
router.use(requireAuth);

// GET /api/favorites - return list of favorited places (with full place details) for the current user
router.get('/', (req, res) => {
    const userId = req.user.id;
    db.all(
        `SELECT f.place_id, f.created_time,
                p.name, p.longitude, p.latitude, p.category, p.description
         FROM Favorite f
         INNER JOIN Place p ON f.place_id = p.id
         WHERE f.user_id = ?
         ORDER BY f.created_time DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// POST /api/favorites/:placeId - add a favorite
router.post('/:placeId', (req, res) => {
    const userId = req.user.id;
    const placeId = parseInt(req.params.placeId, 10);
    if (!Number.isFinite(placeId) || placeId <= 0) {
        return res.status(400).json({ error: '无效的 placeId' });
    }

    // Verify place exists
    db.get('SELECT id FROM Place WHERE id = ?', [placeId], (err, place) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!place) return res.status(404).json({ error: '地点不存在' });

        db.run(
            'INSERT OR IGNORE INTO Favorite (user_id, place_id) VALUES (?, ?)',
            [userId, placeId],
            function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ success: true, place_id: placeId });
            }
        );
    });
});

// DELETE /api/favorites/:placeId - remove a favorite
router.delete('/:placeId', (req, res) => {
    const userId = req.user.id;
    const placeId = parseInt(req.params.placeId, 10);
    if (!Number.isFinite(placeId) || placeId <= 0) {
        return res.status(400).json({ error: '无效的 placeId' });
    }

    db.run(
        'DELETE FROM Favorite WHERE user_id = ? AND place_id = ?',
        [userId, placeId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, place_id: placeId });
        }
    );
});

module.exports = router;
