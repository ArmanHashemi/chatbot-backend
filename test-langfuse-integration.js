/**
 * Test script to verify Langfuse integration
 * Run: node test-langfuse-integration.js
 */

import { initLangfuse, createTrace, createSpan, createGeneration, finalizeTrace, flushLangfuse } from './src/services/langfuseIntegration.js'
import dotenv from 'dotenv'

dotenv.config()

async function testLangfuseIntegration() {
  console.log('🔍 Testing Langfuse Integration...\n')
  
  // Check environment variables
  console.log('1. Environment Variables:')
  console.log('   LANGFUSE_ENABLED:', process.env.LANGFUSE_ENABLED || '❌ Not set')
  console.log('   LANGFUSE_HOST:', process.env.LANGFUSE_HOST || '❌ Not set')
  console.log('   LANGFUSE_PUBLIC_KEY:', process.env.LANGFUSE_PUBLIC_KEY ? '✅ Set' : '❌ Not set')
  console.log('   LANGFUSE_SECRET_KEY:', process.env.LANGFUSE_SECRET_KEY ? '✅ Set' : '❌ Not set')
  console.log()
  
  // Test if Langfuse is enabled
  if (process.env.LANGFUSE_ENABLED !== 'true') {
    console.log('⚠️  Langfuse is disabled. Set LANGFUSE_ENABLED=true to enable monitoring.')
    console.log('    To enable, add to backend/.env:')
    console.log('    LANGFUSE_ENABLED=true')
    console.log('    LANGFUSE_HOST=http://localhost:3000')
    console.log('    LANGFUSE_PUBLIC_KEY=pk-lf-xxx')
    console.log('    LANGFUSE_SECRET_KEY=sk-lf-xxx')
    return
  }
  
  // Initialize Langfuse
  const client = initLangfuse()
  if (!client) {
    console.log('❌ Failed to initialize Langfuse client')
    return
  }
  console.log('✅ Langfuse client initialized')
  console.log()
  
  // Create test trace
  console.log('2. Creating test trace...')
  const trace = createTrace({
    userId: 'test@example.com',
    sessionId: 'test-session-' + Date.now(),
    query: 'این یک تست برای Langfuse است',
    metadata: {
      test: true,
      timestamp: new Date().toISOString()
    }
  })
  
  if (trace) {
    console.log('✅ Trace created successfully')
    
    // Create test observations
    console.log('3. Creating test observations...')
    
    // Context fetch span
    const contextSpan = createSpan(trace, {
      name: 'fetch_context_via_primary_search',
      input: { query: 'تست' },
      output: { context: ['doc1', 'doc2', 'doc3'] }
    })
    console.log('   ✅ Context fetch span created')
    
    // Prompt preparation span
    const prepSpan = createSpan(trace, {
      name: 'prepare_for_generation',
      input: {
        user_query: 'تست',
        history: [],
        context: ['doc1', 'doc2']
      },
      output: {
        prompt_template: 'test_template',
        system_prompt: 'You are a test assistant'
      }
    })
    console.log('   ✅ Prompt preparation span created')
    
    // Generation observation
    const generation = createGeneration(trace, {
      model: 'gpt-4',
      input: 'تست ورودی',
      output: 'این پاسخ تست است',
      modelParameters: {
        temperature: 0.7,
        max_tokens: 100
      },
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15
      }
    })
    console.log('   ✅ Generation observation created')
    
    // Finalize trace
    finalizeTrace(trace, {
      response: 'پاسخ نهایی تست',
      success: true
    })
    console.log('   ✅ Trace finalized')
    
    // Flush to Langfuse
    console.log('\n4. Flushing to Langfuse...')
    await flushLangfuse()
    console.log('✅ Data sent to Langfuse')
    
    console.log('\n📊 View your trace at:')
    console.log(`   ${process.env.LANGFUSE_HOST}/traces`)
    console.log('\n✨ Integration test completed successfully!')
  } else {
    console.log('❌ Failed to create trace')
  }
  
  // Exit after a short delay
  setTimeout(() => process.exit(0), 2000)
}

// Run test
testLangfuseIntegration().catch(console.error)
