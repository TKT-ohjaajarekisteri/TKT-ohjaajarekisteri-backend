const http = require('http')
const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const cors = require('cors')
const config = require('./utils/config')

// Middleware
app.use(cors())
app.use(bodyParser.json())
app.use(express.static('build'))

// Routers
const coursesRouter = require('./controllers/courses')
const studentsRouter = require('./controllers/students')


const apiUrl = '/api'
app.use(`${apiUrl}/courses`, coursesRouter)
app.use(`${apiUrl}/students`, studentsRouter)

// Database connection
const db = require('./models')
db.connect()

// Initialize server
const PORT = config.port
const server = http.createServer(app)
if (process.env.NODE_ENV !== 'test') {
  {server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })}
}

// Close database connection
server.on('close', () => {
  db.close()
})

module.exports = {
  app, server
}
