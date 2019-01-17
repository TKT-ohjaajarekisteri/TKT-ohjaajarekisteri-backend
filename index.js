const { Client } = require('pg');
const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const morgan = require('morgan')
const cors = require('cors')

app.use(bodyParser.json())
app.use(cors())
app.use(express.static('build'))

app.use(morgan(':method :url :json :status :response-time ms'))

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
  });

app.get('/api/', async (request, response) => {
    response.json('Hello World');
})

app.get('/api/ohjaajat', async (request, response) => {
    client.connect()
    let rivit = ''
    await client.query('SELECT * FROM ohjaaja;', (err, res) => {
        if (err) {
            console.log(err)
            response.status(500).json({success: false, data: err})
        }
        for (let row of res.rows) {
            rivit += row
        }
    })
  client.end()
  response.json(rivit) 

})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})