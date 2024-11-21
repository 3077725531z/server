const express = require('express')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()

const app = express()
app.use(cors())
app.use(express.json())

// 创建数据库连接
const db = new sqlite3.Database('feedback.db', (err) => {
  if (err) {
    console.error('数据库连接错误:', err)
  } else {
    console.log('已连接到数据库')
    // 创建留言表
    db.run(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        message TEXT,
        client_ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }
})

// 获取客户端IP地址
const getClientIP = (req) => {
  const forwardedFor = req.headers['x-forwarded-for']
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  
  const ip = req.connection.remoteAddress || 
             req.socket.remoteAddress
  return ip.replace(/::ffff:/, '')
}

// AI聊天接口
app.post('/api/chat', async (req, res) => {
  const { message } = req.body
  const API_KEY = 'sk-0788becbad0a458d87509272f10a4b1b' // 替换成你的API Key
  
  try {
    console.log('收到AI聊天请求:', message)

    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "qwen-turbo",
        input: {
          messages: [
            {
              role: "system",
              content: "你是一个友好的AI助手，你的名字叫小助手。你会用简短、友好的方式回答问题。"
            },
            {
              role: "user",
              content: message
            }
          ]
        },
        parameters: {
          result_format: "message",
          temperature: 0.7,
          top_p: 0.8,
          top_k: 50,
          seed: 1234,
          max_tokens: 1500,
          stop: [],
          repetition_penalty: 1.1
        }
      })
    })

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('AI响应完整数据:', JSON.stringify(data, null, 2))  // 完整打印响应数据

    // 检查响应格式
    if (data.output && data.output.choices && data.output.choices[0]) {
      const choice = data.output.choices[0]
      console.log('Choice对象:', JSON.stringify(choice, null, 2))  // 打印choice对象
      
      // 获取消息内容
      let content = ''
      if (choice.message && choice.message.content) {
        content = choice.message.content
      } else if (choice.text) {
        content = choice.text
      } else {
        throw new Error('无法获取AI响应内容')
      }
      
      const aiResponse = {
        message: content,
        timestamp: new Date().toISOString()
      }
      
      console.log('发送AI响应:', aiResponse)
      res.json({ 
        success: true, 
        data: aiResponse 
      })
    } else {
      console.error('无效的API响应格式:', JSON.stringify(data, null, 2))
      throw new Error('Invalid API response format')
    }
  } catch (error) {
    console.error('AI服务错误:', error)
    console.error('错误详情:', error.message)
    res.status(500).json({ 
      success: false, 
      message: '抱歉，AI服务暂时不可用，请稍后再试',
      error: error.message
    })
  }
})

// 留言相关接口
app.post('/api/feedback', async (req, res) => {
  console.log('收到留言请求:', req.body)
  const { name, email, message } = req.body
  const clientIP = getClientIP(req)

  if (!name || !email || !message) {
    return res.status(400).json({ 
      success: false, 
      message: '请填写所有必填字段' 
    })
  }

  try {
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO feedback (name, email, message, client_ip) VALUES (?, ?, ?, ?)',
        [name, email, message, clientIP],
        function(err) {
          if (err) {
            console.error('数据库插入错误:', err)
            reject(err)
          } else {
            resolve(this.lastID)
          }
        }
      )
    })
    
    console.log('留言保存成功')
    res.json({ success: true, message: '留言已提交' })
  } catch (error) {
    console.error('保存留言失败:', error)
    res.status(500).json({ success: false, message: '提交留言失败' })
  }
})

// 获取所有留言
app.get('/api/feedback', async (req, res) => {
  console.log('收到获取留言请求')
  try {
    const feedback = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM feedback ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
          console.error('查询数据库失败:', err)
          reject(err)
        } else {
          console.log('查询到的留言:', rows)
          resolve(rows)
        }
      })
    })
    
    console.log('发送留言数据:', feedback)
    res.json({ success: true, data: feedback })
  } catch (error) {
    console.error('获取留言失败:', error)
    res.status(500).json({ success: false, message: '获取留言失败' })
  }
})

// 删除留言
app.delete('/api/feedback/:id', async (req, res) => {
  const id = req.params.id
  
  try {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM feedback WHERE id = ?', [id], function(err) {
        if (err) reject(err)
        else resolve()
      })
    })
    
    res.json({ success: true, message: '留言已删除' })
  } catch (error) {
    console.error('删除留言失败:', error)
    res.status(500).json({ success: false, message: '删除留言失败' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`)
})

// 优雅关闭
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('关闭数据库时出错:', err)
    } else {
      console.log('数据库连接已关闭')
    }
    process.exit(0)
  })
})






