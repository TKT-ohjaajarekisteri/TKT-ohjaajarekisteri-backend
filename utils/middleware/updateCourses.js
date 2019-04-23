const axios = require('axios')
const db = require('../../models/index')
const sort = require('fast-sort')
const https = require('https')
const moment = require('moment')
const periodDates = require('../../config/periods.json')

//Updates all courses
const updateCourses = async () => {

  const instance = axios.create({
    httpsAgent: new https.Agent({  
      rejectUnauthorized: false
    })
  })

  const candidateCoursesUrl = await db.StudyProgramUrl.findOne({ where: { type: 'candidate' } })
  const masterCoursesUrl = await db.StudyProgramUrl.findOne({ where: { type: 'master' } })
  const dataScienceCoursesUrl = await db.StudyProgramUrl.findOne({ where: { type: 'data' } })

  const candidateDataJson = await instance.get(candidateCoursesUrl.url)
  const masterDataJson = await instance.get(masterCoursesUrl.url) 
  const dataScienceDataJson = await instance.get(dataScienceCoursesUrl.url)

  const candidataCourses = Object.assign(candidateDataJson.data)
  const masterCourses = Object.assign(masterDataJson.data)
  const dataScienceCourses = Object.assign(dataScienceDataJson.data)

  const addedCourses = []

  const currentCourses = await db.Course.findAll({ 
    raw:true,
    attributes: {
      exclude: ['course_id', 'createdAt', 'updatedAt', 'groups', 'hidden']
    }
  })

  const coursesAtStart = await db.Course.findAll({ 
    include: 
      [{
        model: db.Student,
        as: 'students'
      }]
  })

  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development') {
    console.log('Updating courses...')
  }
  await addCoursesToDatabase(candidataCourses, addedCourses, currentCourses, coursesAtStart)
  await addCoursesToDatabase(masterCourses, addedCourses, currentCourses, coursesAtStart)
  await addCoursesToDatabase(dataScienceCourses, addedCourses, currentCourses, coursesAtStart)

  sort(addedCourses).asc([
    'learningopportunity_id' // Sort by ID
  ])

  await db.Course.bulkCreate(addedCourses)
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development') {
    if(addedCourses.length > 0) console.log('Courses have been updated')
    else console.log('Database already up to date')
  }
  return addedCourses
}

//Adds the courses from an array to the database
const addCoursesToDatabase = async (courses, addedCourses, currentCourses, coursesAtStart) => {
  for(let i = 0; i < courses.length; i++) {
    const course = {
      learningopportunity_id: courses[i].learningopportunity_id,
      course_name: courses[i].realisation_name[0].text,
      periods: getPeriods(courses[i]),
      year: parseInt(courses[i].start_date.substring(0,4)),
      startingDate: moment(courses[i].start_date).format('DD[.]MM[.]YYYY'),
      endingDate: moment(courses[i].end_date).format('DD[.]MM[.]YYYY')
    }
    const courseIdentifier = course.learningopportunity_id.substring(0,3)
    const typeCode = parseInt(courses[i].realisation_type_code)
    if((courseIdentifier === 'CSM' || courseIdentifier === 'TKT' || courseIdentifier === 'DAT') && typeCode !== 8) {
      if(!courseExists(currentCourses, course)) {
        currentCourses.push(course) 
        course.groups = await getMostRecentGroupSize(course.course_name, coursesAtStart)
        addedCourses.push(course)      
      }
    }
  }
}

//Returns an array of periods the course is on
const getPeriods = (course) => {
  const startDate = new Date(course.start_date)
  const endDate = new Date(course.end_date)
  const periods = []
  const daysBetween = getDatesBetween(startDate, endDate)
  //Goes through all the periods and checks if a day of the course is on that period. 
  //If true, it is added to the array and the loop progresses to the next period in the json.
  periodDates.data.forEach( date => {
    const periodStart = new Date(date.start_date).getTime()
    const periodEnd = new Date(date.end_date).getTime()

    for(let i = 0; i < daysBetween.length; i++) {
      const dayMilliseconds = daysBetween[i].getTime()
      //Checks if the day is between the two dates. getTime() returns the date as milliseconds from Jan 1, 1970 
      if(dayMilliseconds <= periodEnd && dayMilliseconds >= periodStart) {
        let period = date.abbreviation[0].text
        if(period === 'Kesä') period = '5'
        periods.push(parseInt(period))
        break
      }
    }

  })
  //Returns 0 if course is between periods
  if(periods.length === 0) return [0]
  return periods
}

//Returns all the dates between two dates
function getDatesBetween(startDate, stopDate) {
  const dateArray = []
  let currentDate = moment(startDate)
  stopDate = moment(stopDate)
  while (currentDate <= stopDate) {
    dateArray.push( new Date( moment(currentDate).format() ) )
    currentDate = moment(currentDate).add(1, 'days')
  }
  return dateArray
}

//Checks if the course exists in database or has been added recently
const courseExists = (currentCourses, course) => {
  for(let k = 0; k < currentCourses.length; k++) { 
    if(JSON.stringify(currentCourses[k]) === JSON.stringify(course)) {
      return true
    }
  }
  return false
}

//Returns the group size of all applicants groups combined for the previous implementation of the course 
const getMostRecentGroupSize = async (newCourseName, coursesAtStart) => {

  //Get all courses with the same name as the course to be added
  const sameNameCourses = coursesAtStart.filter(courseAtStart => newCourseName  === courseAtStart.course_name)
  if(sameNameCourses.length === 0) return null
  //Get the most recent course by getting the course with largest milliseconds at ending date.
  let previousTime = null
  let previousCourse = null
  sameNameCourses.forEach(course => {
    const milliseconds = parseDate(course.endingDate).getTime()
    if(milliseconds > previousTime) {
      previousTime = milliseconds
      previousCourse = course
    } 
  })
  if(previousCourse.students.length === 0) return null

  //Get the groups of all applications as an array of groups
  const groups = []

  previousCourse.students.forEach( student => {
    if(student.Application.accepted) {
      groups.push(student.Application.groups)
    }
  })
  //Sum up all of the groups on the course
  const sum = groups.reduce((partial_sum, a) => partial_sum + a)
  return sum
}

//Returns a date object from date format DD.MM.YYYY String
const parseDate = (date) => {
  const day = date.substring(0,2)
  const month = date.substring(3,5)
  const year = date.substring(6, date.length)
  return new Date(year + '-' + month + '-' + day)
}
module.exports = {
  updateCourses
}