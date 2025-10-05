#!/usr/bin/env node

/**
 * Setup script for Dify API contract test environment
 * This script creates necessary test users and API keys
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import User from './src/models/User.js'
import ApiKey from './src/models/ApiKey.js'
import { connectDB } from './src/config/db.js'

const TEST_API_KEY = process.env.DIFY_TEST_API_KEY || 'app-test-key-change-me-for-production'
const TEST_USER_ID = process.env.DIFY_TEST_USER_ID || 'test-user-id'
const TEST_USER_EMAIL = 'test@example.com'

async function setupTestEnvironment() {
  console.log('🚀 Setting up test environment...\n')
  
  try {
    // Connect to database
    await connectDB()
    console.log('✅ Connected to MongoDB')
    
    // Create or get test user
    let testUser = await User.findOne({ email: TEST_USER_EMAIL })
    
    if (!testUser) {
      const passwordHash = await User.hashPassword('test1234')
      testUser = await User.create({
        email: TEST_USER_EMAIL,
        name: 'Test User',
        passwordHash,
        isAdmin: false
      })
      console.log('✅ Created test user:', TEST_USER_EMAIL)
    } else {
      console.log('ℹ️  Test user already exists:', TEST_USER_EMAIL)
    }
    
    // Create or update API key
    let apiKey = await ApiKey.findOne({ key: TEST_API_KEY })
    
    if (!apiKey) {
      apiKey = await ApiKey.create({
        userId: testUser._id,
        key: TEST_API_KEY,
        name: 'Contract Test API Key',
        isActive: true
      })
      console.log('✅ Created test API key')
    } else {
      // Update to ensure it's linked to test user and active
      apiKey.userId = testUser._id
      apiKey.isActive = true
      await apiKey.save()
      console.log('ℹ️  Test API key already exists and updated')
    }
    
    console.log('\n📋 Test Configuration Summary:')
    console.log('================================')
    console.log(`API Key: ${TEST_API_KEY}`)
    console.log(`User ID (use any of these):`)
    console.log(`  - MongoDB ID: ${testUser._id}`)
    console.log(`  - Email: ${testUser.email}`)
    console.log(`  - Test ID: ${TEST_USER_ID}`)
    console.log('================================')
    
    console.log('\n🎯 Next Steps:')
    console.log('1. Make sure backend is running: npm run dev')
    console.log('2. Run contract tests: ./run-contract-test.sh')
    console.log('\n✨ Test environment setup complete!')
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
  }
}

// Run setup
setupTestEnvironment().catch(console.error)
