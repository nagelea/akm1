import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('Environment check:')
    console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing')
    console.log('SUPABASE_SERVICE_KEY:', supabaseServiceKey ? 'Set' : 'Missing')
    console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing')

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ 
        error: 'Missing environment variables',
        details: {
          SUPABASE_URL: !!supabaseUrl,
          SUPABASE_SERVICE_KEY: !!supabaseServiceKey
        }
      })
    }

    // 测试 service role 连接
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. 测试查询权限
    const { data: testData, error: selectError } = await supabaseService
      .from('visitor_stats')
      .select('ip_address, country')
      .is('country', null)
      .limit(3)

    if (selectError) {
      return NextResponse.json({ 
        error: 'Select failed', 
        details: selectError 
      })
    }

    console.log('Found IPs without country:', testData)

    if (testData.length === 0) {
      return NextResponse.json({ 
        message: 'No IPs need geolocation update',
        allIPsHaveLocation: true
      })
    }

    // 2. 测试更新权限
    const testIP = testData[0].ip_address
    console.log('Testing update on IP:', testIP)

    const { data: updateResult, error: updateError } = await supabaseService
      .from('visitor_stats')
      .update({ country: 'TEST_COUNTRY' })
      .eq('ip_address', testIP)
      .is('country', null)
      .select('id')

    if (updateError) {
      return NextResponse.json({ 
        error: 'Update failed', 
        details: updateError,
        testIP: testIP
      })
    }

    console.log('Update result:', updateResult)

    // 3. 恢复原始状态
    await supabaseService
      .from('visitor_stats')
      .update({ country: null })
      .eq('ip_address', testIP)
      .eq('country', 'TEST_COUNTRY')

    return NextResponse.json({
      success: true,
      message: 'Database access test passed',
      details: {
        ipsFound: testData.length,
        updateWorked: updateResult.length > 0,
        updatedRecords: updateResult.length
      }
    })

  } catch (error) {
    console.error('Test failed:', error)
    return NextResponse.json({ 
      error: 'Test exception', 
      message: error.message,
      stack: error.stack
    })
  }
}