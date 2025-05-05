const express = require('express')
const bodyParser = require('body-parser')

const app = express()
const port = process.env.PORT || 3000

// In-memory store for widgets
let widgets = {
  1: { id: 1, name: 'Sprocket', color: 'red' },
  2: { id: 2, name: 'Gadget', color: 'blue' },
}
let nextId = 3

app.use(bodyParser.json())

// --- Widget CRUD Routes ---

// GET /widgets - List all widgets
app.get('/widgets', (req, res) => {
  res.json(Object.values(widgets))
})

// GET /widgets/:id - Get a specific widget
app.get('/widgets/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const widget = widgets[id]
  if (widget) {
    res.json(widget)
  } else {
    res.status(404).send('Widget not found')
  }
})

// POST /widgets - Create a new widget
app.post('/widgets', (req, res) => {
  const { name, color } = req.body
  if (!name || !color) {
    return res.status(400).send('Missing name or color')
  }
  const newWidget = { id: nextId++, name, color }
  widgets[newWidget.id] = newWidget
  res.status(201).json(newWidget)
})

// PUT /widgets/:id - Update an existing widget
app.put('/widgets/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!widgets[id]) {
    return res.status(404).send('Widget not found')
  }
  const { name, color } = req.body
  if (!name || !color) {
    return res.status(400).send('Missing name or color')
  }
  widgets[id] = { ...widgets[id], name, color }
  res.json(widgets[id])
})

// DELETE /widgets/:id - Delete a widget
app.delete('/widgets/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (!widgets[id]) {
    return res.status(404).send('Widget not found')
  }
  delete widgets[id]
  res.status(204).send() // No content
})

// --- Root Route ---
app.get('/', (req, res) => {
  res.send('Hello World Express Server!')
})

// --- Start Server ---
if (require.main === module) {
  // Start server only if run directly
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`)
  })
}

// Export app for potential testing
module.exports = app
