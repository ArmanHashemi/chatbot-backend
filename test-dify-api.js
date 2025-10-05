#!/usr/bin/env node

/**
 * Quick test script for Dify API endpoints
 */

import fetch from 'node-fetch'

const BASE_URL = 'http://localhost:3001'
const API_KEY = process.env.DIFY_TEST_API_KEY || 'app-test-key-change-me-for-production'
const USER_ID = process.env.DIFY_TEST_USER_ID || 'test-user-id'

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function testBlockingMode() {
  log('\n🧪 Testing BLOCKING mode...', 'blue')
  
  try {
    const response = await fetch(`${BASE_URL}/v1/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'سلام چطوری؟',
        inputs: {},
        user: USER_ID,
        response_mode: 'blocking'
      })
    })

    const data = await response.json()
    
    if (response.ok) {
      log('✅ Blocking mode SUCCESS', 'green')
      log('Response fields:', 'yellow')
      log(`  - event: ${data.event}`)
      log(`  - task_id: ${data.task_id?.substring(0, 8)}...`)
      log(`  - conversation_id: ${data.conversation_id}`)
      log(`  - answer length: ${data.answer?.length} chars`)
      log(`  - metadata.retriever_resources: ${data.metadata?.retriever_resources?.length || 0} items`)
      return true
    } else {
      log(`❌ Blocking mode FAILED: ${data.message}`, 'red')
      return false
    }
  } catch (error) {
    log(`❌ Blocking mode ERROR: ${error.message}`, 'red')
    return false
  }
}

async function testStreamingMode() {
  log('\n🧪 Testing STREAMING mode...', 'blue')
  
  try {
    const response = await fetch(`${BASE_URL}/v1/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'یک جوک کوتاه بگو',
        inputs: {},
        user: USER_ID,
        response_mode: 'streaming'
      })
    })

    if (!response.ok) {
      const error = await response.text()
      log(`❌ Streaming mode FAILED: ${error}`, 'red')
      return false
    }

    log('📡 Receiving stream...', 'yellow')
    
    const reader = response.body
    let buffer = ''
    let eventCount = 0
    let fullText = ''
    
    return new Promise((resolve) => {
      reader.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (!line.trim()) continue
          if (!line.startsWith('data: ')) continue
          
          try {
            const data = JSON.parse(line.slice(6))
            eventCount++
            
            if (data.event === 'message') {
              fullText += data.answer || ''
              process.stdout.write('.')
            } else if (data.event === 'message_end') {
              console.log()
              log(`\n✅ Streaming mode SUCCESS`, 'green')
              log(`  - Received ${eventCount} events`, 'yellow')
              log(`  - Full text: ${fullText.length} chars`, 'yellow')
              log(`  - Message ID: ${data.message_id}`, 'yellow')
              resolve(true)
            } else if (data.event === 'error') {
              console.log()
              log(`❌ Stream error: ${data.message}`, 'red')
              resolve(false)
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      })
      
      reader.on('end', () => {
        if (eventCount === 0) {
          log('❌ No events received', 'red')
          resolve(false)
        }
      })
      
      reader.on('error', (err) => {
        log(`❌ Stream error: ${err.message}`, 'red')
        resolve(false)
      })
    })
  } catch (error) {
    log(`❌ Streaming mode ERROR: ${error.message}`, 'red')
    return false
  }
}

async function testInvalidAuth() {
  log('\n🧪 Testing INVALID authentication...', 'blue')
  
  try {
    const response = await fetch(`${BASE_URL}/v1/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer INVALID_KEY',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: 'test',
        inputs: {},
        user: USER_ID
      })
    })

    const data = await response.json()
    
    if (response.status === 401 && data.code === 'unauthorized') {
      log('✅ Invalid auth handled correctly', 'green')
      return true
    } else {
      log(`❌ Invalid auth test failed: expected 401, got ${response.status}`, 'red')
      return false
    }
  } catch (error) {
    log(`❌ Invalid auth test ERROR: ${error.message}`, 'red')
    return false
  }
}

async function runTests() {
  log('🚀 Starting Dify API Tests', 'blue')
  log('================================', 'blue')
  
  // Check if backend is running
  try {
    const health = await fetch(`${BASE_URL}/api/health`)
    if (!health.ok) throw new Error('Backend not healthy')
  } catch (error) {
    log('❌ Backend is not running! Start it with: npm run dev', 'red')
    process.exit(1)
  }
  
  const results = []
  
  // Run tests
  results.push(await testInvalidAuth())
  results.push(await testBlockingMode())
  results.push(await testStreamingMode())
  
  // Summary
  log('\n================================', 'blue')
  log('📊 TEST SUMMARY', 'blue')
  log('================================', 'blue')
  
  const passed = results.filter(r => r).length
  const failed = results.length - passed
  
  if (failed === 0) {
    log(`✅ ALL TESTS PASSED (${passed}/${results.length})`, 'green')
  } else {
    log(`⚠️  Some tests failed: ${passed} passed, ${failed} failed`, 'yellow')
  }
  
  process.exit(failed === 0 ? 0 : 1)
}

// Run tests
runTests().catch(console.error)
