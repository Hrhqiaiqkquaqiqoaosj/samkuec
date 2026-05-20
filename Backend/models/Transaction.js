const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: [true, 'Transaction ID is required'],
    unique: true,
    trim: true
  },
  chargerId: {
    type: String, // This will store the charger serial number for OCPP compatibility
    required: [true, 'Charger ID is required'],
    trim: true
  },
  chargerObjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Charger'
  },
  stationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Station'
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  connectorId: {
    type: Number,
    required: [true, 'Connector ID is required'],
    min: [1, 'Connector ID must be at least 1']
  },
  idTag: {
    type: String,
    required: [true, 'ID Tag is required'],
    trim: true
  },
  rfidCardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFIDCard'
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required'],
    default: Date.now
  },
  endTime: {
    type: Date
  },
  meterStart: {
    type: Number,
    required: [true, 'Meter start value is required'],
    min: [0, 'Meter start cannot be negative']
  },
  meterStop: {
    type: Number,
    min: [0, 'Meter stop cannot be negative']
  },
  energyConsumed: {
    type: Number,
    min: [0, 'Energy consumed cannot be negative'],
    get: function() {
      if (this.meterStop && this.meterStart) {
        return this.meterStop - this.meterStart;
      }
      return 0;
    }
  },
  duration: {
    type: Number, // Duration in minutes
    min: [0, 'Duration cannot be negative'],
    get: function() {
      if (this.endTime && this.startTime) {
        return Math.round((this.endTime - this.startTime) / (1000 * 60));
      }
      return 0;
    }
  },
  status: {
    type: String,
    enum: ['INITIATED', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'INITIATED',
    required: true
  },
  stopReason: {
    type: String,
    enum: ['EVDisconnected', 'EmergencyStop', 'EnergyLimitReached', 'GroundFault', 'ImmediateReset', 'Local', 'Other', 'OvercurrentFault', 'PowerLoss', 'PowerQuality', 'Reboot', 'Remote', 'SOCLimitReached', 'StoppedByEV', 'TimeLimitReached', 'Timeout']
  },
  pricing: {
    ratePerKWh: {
      type: Number,
      min: [0, 'Rate per kWh cannot be negative'],
      default: 0
    },
    ratePerMinute: {
      type: Number,
      min: [0, 'Rate per minute cannot be negative'],
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    totalAmount: {
      type: Number,
      min: [0, 'Total amount cannot be negative'],
      default: 0
    },
    energyCost: {
      type: Number,
      min: [0, 'Energy cost cannot be negative'],
      default: 0
    },
    timeCost: {
      type: Number,
      min: [0, 'Time cost cannot be negative'],
      default: 0
    },
    taxes: {
      type: Number,
      min: [0, 'Taxes cannot be negative'],
      default: 0
    },
    discounts: {
      type: Number,
      min: [0, 'Discounts cannot be negative'],
      default: 0
    }
  },
  payment: {
    method: {
      type: String,
      enum: ['WALLET', 'CARD', 'UPI', 'CASH', 'SUBSCRIPTION'],
      default: 'WALLET'
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },
    transactionId: {
      type: String,
      trim: true
    },
    gateway: {
      type: String,
      trim: true
    },
    paidAt: Date,
    refundedAt: Date,
    refundAmount: {
      type: Number,
      min: [0, 'Refund amount cannot be negative'],
      default: 0
    }
  },
  meterValues: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    values: [{
      measurand: {
        type: String,
        enum: ['Energy.Active.Import.Register', 'Power.Active.Import', 'Current.Import', 'Voltage', 'Temperature']
      },
      value: Number,
      unit: String,
      phase: String,
      location: String
    }]
  }],
  errorCodes: [{
    code: String,
    description: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  reservation: {
    reservationId: String,
    expiryDate: Date,
    parentIdTag: String
  },
  remoteStart: {
    isRemoteStart: {
      type: Boolean,
      default: false
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    requestedAt: Date
  },
  chargingProfile: {
    chargingProfileId: Number,
    stackLevel: Number,
    chargingProfilePurpose: {
      type: String,
      enum: ['ChargePointMaxProfile', 'TxDefaultProfile', 'TxProfile']
    },
    chargingProfileKind: {
      type: String,
      enum: ['Absolute', 'Recurring', 'Relative']
    },
    recurrencyKind: {
      type: String,
      enum: ['Daily', 'Weekly']
    },
    validFrom: Date,
    validTo: Date,
    chargingSchedule: {
      duration: Number,
      startSchedule: Date,
      chargingRateUnit: {
        type: String,
        enum: ['W', 'A']
      },
      chargingSchedulePeriod: [{
        startPeriod: Number,
        limit: Number,
        numberPhases: Number
      }]
    }
  },
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [String],
    notes: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

// Virtual for customer details
transactionSchema.virtual('customer', {
  ref: 'Customer',
  localField: 'customerId',
  foreignField: '_id',
  justOne: true
});

// Virtual for charger details
transactionSchema.virtual('charger', {
  ref: 'Charger',
  localField: 'chargerObjectId',
  foreignField: '_id',
  justOne: true
});

// Virtual for station details
transactionSchema.virtual('station', {
  ref: 'Station',
  localField: 'stationId',
  foreignField: '_id',
  justOne: true
});

// Virtual for RFID card details
transactionSchema.virtual('rfidCard', {
  ref: 'RFIDCard',
  localField: 'rfidCardId',
  foreignField: '_id',
  justOne: true
});

// Indexes for better performance
transactionSchema.index({ transactionId: 1 }, { unique: true });
transactionSchema.index({ chargerId: 1 });
transactionSchema.index({ chargerObjectId: 1 });
transactionSchema.index({ stationId: 1 });
transactionSchema.index({ customerId: 1 });
transactionSchema.index({ idTag: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ startTime: -1 });
transactionSchema.index({ endTime: -1 });
transactionSchema.index({ 'payment.status': 1 });

// Pre-save middleware to calculate costs
transactionSchema.pre('save', function(next) {
  if (this.isModified('meterStop') || this.isModified('endTime')) {
    // Calculate energy consumed
    if (this.meterStop && this.meterStart) {
      const energyConsumed = this.meterStop - this.meterStart;
      
      // Calculate energy cost
      if (this.pricing.ratePerKWh > 0) {
        this.pricing.energyCost = energyConsumed * this.pricing.ratePerKWh;
      }
    }

    // Calculate time cost
    if (this.endTime && this.startTime && this.pricing.ratePerMinute > 0) {
      const durationInMinutes = Math.round((this.endTime - this.startTime) / (1000 * 60));
      this.pricing.timeCost = durationInMinutes * this.pricing.ratePerMinute;
    }

    // Calculate total amount
    this.pricing.totalAmount = 
      (this.pricing.energyCost || 0) + 
      (this.pricing.timeCost || 0) + 
      (this.pricing.taxes || 0) - 
      (this.pricing.discounts || 0);
  }

  next();
});

// Instance method to complete transaction
transactionSchema.methods.complete = function(meterStop, reason = 'Local') {
  this.status = 'COMPLETED';
  this.endTime = new Date();
  this.meterStop = meterStop;
  this.stopReason = reason;
  return this.save();
};

// Instance method to cancel transaction
transactionSchema.methods.cancel = function(reason = 'Other') {
  this.status = 'CANCELLED';
  this.endTime = new Date();
  this.stopReason = reason;
  return this.save();
};

// Instance method to add meter values
transactionSchema.methods.addMeterValues = function(values) {
  this.meterValues.push({
    timestamp: new Date(),
    values: values
  });
  
  // Keep only last 1000 meter value records
  if (this.meterValues.length > 1000) {
    this.meterValues = this.meterValues.slice(-1000);
  }
  
  return this.save();
};

// Static method to find active transactions
transactionSchema.statics.findActive = function() {
  return this.find({ status: 'ACTIVE' });
};

// Static method to find transactions by charger
transactionSchema.statics.findByCharger = function(chargerId) {
  return this.find({ chargerId }).sort({ startTime: -1 });
};

// Static method to find transactions by customer
transactionSchema.statics.findByCustomer = function(customerId) {
  return this.find({ customerId }).sort({ startTime: -1 });
};

// Static method to get transaction statistics
transactionSchema.statics.getStatistics = function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalEnergyConsumed: { $sum: '$energyConsumed' },
        totalRevenue: { $sum: '$pricing.totalAmount' },
        averageEnergyPerTransaction: { $avg: '$energyConsumed' },
        averageDuration: { $avg: '$duration' },
        completedTransactions: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
        },
        activeTransactions: {
          $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] }
        }
      }
    }
  ];

  return this.aggregate(pipeline);
};

module.exports = mongoose.model('Transaction', transactionSchema);
