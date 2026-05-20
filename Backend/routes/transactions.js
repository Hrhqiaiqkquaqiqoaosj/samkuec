const express = require('express');
const { auth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Charger = require('../models/Charger');
const User = require('../models/User');

const router = express.Router();

// Get all transactions
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, userId, chargerId } = req.query;
        
        // Build filter object
        const filter = {};
        if (status) filter.status = status;
        if (userId) filter.userId = userId;
        if (chargerId) filter.chargerId = chargerId;
        
        // If user is not admin, only show their transactions
        if (req.user.role !== 'admin') {
            filter.userId = req.user.id;
        }

        const transactions = await Transaction.find(filter)
            .populate('userId', 'name email')
            .populate('chargerId', 'serialNumber name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Transaction.countDocuments(filter);

        res.json({
            success: true,
            data: transactions,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions',
            error: error.message
        });
    }
});

// Get transaction by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id)
            .populate('userId', 'name email')
            .populate('chargerId', 'serialNumber name');

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        // Check if user can access this transaction
        if (req.user.role !== 'admin' && transaction.userId._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction',
            error: error.message
        });
    }
});

// Start a test charging session (1 rupee)
router.post('/start-test-charge', auth, async (req, res) => {
    try {
        const { chargerId, amount = 1 } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!chargerId) {
            return res.status(400).json({
                success: false,
                message: 'Charger ID is required'
            });
        }

        // Find the charger
        const charger = await Charger.findOne({
            $or: [
                { serialNumber: chargerId },
                { _id: chargerId },
                { id: chargerId }
            ]
        });

        if (!charger) {
            return res.status(404).json({
                success: false,
                message: 'Charger not found'
            });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate unique transaction ID
        const transactionId = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create test transaction
        const transaction = new Transaction({
            transactionId: transactionId,
            chargerId: charger.serialNumber,
            chargerObjectId: charger._id,
            stationId: charger.stationId, // Add station ID from charger
            customerId: userId,
            connectorId: 1,
            idTag: user.email || user._id.toString(),
            startTime: new Date(),
            meterStart: 0,
            status: 'ACTIVE',
            pricing: {
                ratePerKWh: 1, // 1 rupee per kWh for test
                ratePerMinute: 0,
                currency: 'INR',
                totalAmount: 0,
                energyCost: 0,
                timeCost: 0,
                taxes: 0,
                discounts: 0
            },
            payment: {
                method: 'WALLET',
                status: 'PENDING'
            },
            remoteStart: {
                isRemoteStart: true,
                requestedBy: userId,
                requestedAt: new Date()
            },
            metadata: {
                createdBy: userId,
                tags: ['test', 'qr-scan'],
                notes: 'Test transaction initiated via QR scan'
            }
        });

        await transaction.save();

        // Send OCPP command to start charging (if charger is connected)
        try {
            // Check if we have access to the OCPP server instance
            if (global.ocppServer) {
                const success = global.ocppServer.sendCommandToChargePoint(
                    charger.serialNumber,
                    'RemoteStartTransaction',
                    {
                        idTag: user.email || user._id.toString(),
                        connectorId: 1
                    }
                );
                
                if (success) {
                    console.log(`OCPP RemoteStartTransaction sent to ${charger.serialNumber}`);
                } else {
                    console.log(`Failed to send OCPP command - charger ${charger.serialNumber} not connected`);
                }
            }
        } catch (ocppError) {
            console.error('OCPP command error:', ocppError);
            // Don't fail the transaction if OCPP command fails
        }

        // Simulate charging completion after 30 seconds for test
        setTimeout(async () => {
            try {
                const updatedTransaction = await Transaction.findById(transaction._id);
                if (updatedTransaction && updatedTransaction.status === 'ACTIVE') {
                    updatedTransaction.status = 'COMPLETED';
                    updatedTransaction.endTime = new Date();
                    updatedTransaction.meterStop = 0.1; // 0.1 kWh for test
                    updatedTransaction.payment.status = 'COMPLETED';
                    updatedTransaction.payment.paidAt = new Date();
                    await updatedTransaction.save();
                    
                    console.log(`Test transaction ${transaction._id} completed automatically`);
                    
                    // Send stop command to charger
                    if (global.ocppServer) {
                        global.ocppServer.sendCommandToChargePoint(
                            charger.serialNumber,
                            'RemoteStopTransaction',
                            {
                                transactionId: transaction.transactionId
                            }
                        );
                    }
                }
            } catch (error) {
                console.error('Error completing test transaction:', error);
            }
        }, 30000); // 30 seconds

        res.json({
            success: true,
            message: 'Test charging session started',
            transactionId: transaction._id,
            data: {
                transaction: transaction,
                charger: {
                    id: charger._id,
                    serialNumber: charger.serialNumber,
                    name: charger.name
                },
                estimatedDuration: '30 seconds (test)',
                amount: amount
            }
        });

    } catch (error) {
        console.error('Error starting test charge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start test charging session',
            error: error.message
        });
    }
});

// Start a regular charging session
router.post('/start-charge', auth, async (req, res) => {
    try {
        const { chargerId, amount, connectorId = 1 } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!chargerId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Charger ID and amount are required'
            });
        }

        // Find the charger
        const charger = await Charger.findOne({
            $or: [
                { serialNumber: chargerId },
                { _id: chargerId },
                { id: chargerId }
            ]
        });

        if (!charger) {
            return res.status(404).json({
                success: false,
                message: 'Charger not found'
            });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Create transaction
        const transaction = new Transaction({
            userId: userId,
            chargerId: charger._id,
            amount: amount,
            status: 'active',
            type: 'regular',
            startTime: new Date(),
            energyConsumed: 0,
            rate: 10, // 10 rupees per kWh
            sessionData: {
                chargerSerialNumber: charger.serialNumber,
                chargerName: charger.name,
                userName: user.name,
                userEmail: user.email,
                connectorId: connectorId
            }
        });

        await transaction.save();

        // Send OCPP command to start charging
        try {
            if (global.ocppServer) {
                const success = global.ocppServer.sendCommandToChargePoint(
                    charger.serialNumber,
                    'RemoteStartTransaction',
                    {
                        idTag: user.email || user._id.toString(),
                        connectorId: connectorId
                    }
                );
                
                if (!success) {
                    throw new Error('Charger not connected');
                }
            }
        } catch (ocppError) {
            // Rollback transaction if OCPP command fails
            await Transaction.findByIdAndDelete(transaction._id);
            throw new Error('Failed to start charging - charger not available');
        }

        res.json({
            success: true,
            message: 'Charging session started',
            transactionId: transaction._id,
            data: transaction
        });

    } catch (error) {
        console.error('Error starting charge:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to start charging session',
            error: error.message
        });
    }
});

// Stop a charging session
router.post('/stop-charge/:transactionId', auth, async (req, res) => {
    try {
        const { transactionId } = req.params;

        const transaction = await Transaction.findById(transactionId)
            .populate('chargerId', 'serialNumber name');

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        // Check if user can stop this transaction
        if (req.user.role !== 'admin' && transaction.userId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (transaction.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Transaction is not active'
            });
        }

        // Send OCPP stop command
        try {
            if (global.ocppServer && transaction.chargerId) {
                global.ocppServer.sendCommandToChargePoint(
                    transaction.chargerId.serialNumber,
                    'RemoteStopTransaction',
                    {
                        transactionId: transactionId
                    }
                );
            }
        } catch (ocppError) {
            console.error('OCPP stop command error:', ocppError);
        }

        // Update transaction
        transaction.status = 'completed';
        transaction.endTime = new Date();
        
        // Calculate duration and energy (simplified calculation)
        const durationMs = transaction.endTime - transaction.startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        
        // For test transactions, use minimal energy
        if (transaction.type === 'test') {
            transaction.energyConsumed = 0.1;
        } else {
            // Estimate energy based on duration (this should come from the charger in real implementation)
            transaction.energyConsumed = Math.max(0.1, durationHours * 5); // 5 kW average
        }
        
        transaction.amount = transaction.energyConsumed * transaction.rate;
        
        await transaction.save();

        res.json({
            success: true,
            message: 'Charging session stopped',
            data: transaction
        });

    } catch (error) {
        console.error('Error stopping charge:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop charging session',
            error: error.message
        });
    }
});

module.exports = router;
