// Noise Test File: Contains 1 real critical SQL injection bug alongside heavy stylistic noise, bad formatting & strange names

const  express= require('express') ;
const   app =express ( ) ;

let   mY_weird_vAr_NaMe_123   = "temp_value_data"  ;
var    FOO_BAR_BAZ  = 42 ;

app.get ( '/user/search' ,  ( req , res ) => {

  // REAL VULNERABILITY: Raw SQL string concatenation from query parameter
  var sql_query = "SELECT * FROM users WHERE username = '" + req.query.username + "'";

  db.query(sql_query, function(err, result) {
      if(err) {
         console.log("Error occurred"  ) ;
            return res.send( "Db error" ) ;
      }
      res.send( result ) ;
  });

}) ;

function    some_unnecessary_formatting_func (   a , b   ) {
    let x=a+b ; 
    let   y = x * 2  ;
        return    y ;
}

function   another_badly_formatted_helper (  str_data  ) {
  var  temp_var_name_x_y_z = str_data.trim ( ) ;
      console.log ( "Logging data: " + temp_var_name_x_y_z ) ;
   return   temp_var_name_x_y_z.toUpperCase ( ) ;
}

function   calculate_something_weird ( val1 , val2 ) {
    let   a_1 = val1 + 10 ;
    let   b_2 = val2 * 20 ;
        let   result_sum = a_1 + b_2 ;
    return    result_sum ;
}

app.listen( 3000 ) ;
