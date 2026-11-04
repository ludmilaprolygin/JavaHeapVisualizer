public class Ciudad
{
    //----------------------------------------------------------------------------------------------
    //---- Atributos -------------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------

    private int CP;
    private int poblacion;
    private float superficie;

    //----------------------------------------------------------------------------------------------
    //---- Constructores ---------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------
        
    public Ciudad ( int c) 
    { 
        CP = c;
    }
    
    public Ciudad (int c, int p, float s) 
    {   CP=c;
        poblacion=p;
        superficie=s;
  
    }

    //----------------------------------------------------------------------------------------------
    //---- Comandos --------------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------

    public void establecerPoblacion(int p) 
    { 
        poblacion = p;
    }
    
    public void aumentarPoblacion(int cre) 
    {
        //Se incrementa la población de acuerdo al valor introducido por parametro
        poblacion += cre;
        if (poblacion < 0) {
            poblacion = 0;
        }
    }

    public void establecerSuperficie(float s) 
    { 
        superficie = s;
    }
    
   public void copy(Ciudad otra)
   {
       CP=otra.obtenerCP();
       poblacion=otra.obtenerPoblacion();
       superficie=otra.obtenerSuperficie();
   }
    
    //----------------------------------------------------------------------------------------------
    //---- Consultas -------------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------
    
    public int obtenerCP()
    {
        return CP;
    }
    
    public int obtenerPoblacion()
    {
        return poblacion;
    }
    
    public float obtenerSuperficie()
    {
        return superficie;
    }
    
    public float obtenerDensidad() 
    { 
        return poblacion / superficie;
    }
    
    public String toString() 
    {
        return "Codigo Postal: " + CP + " - Poblacion: " + poblacion + " - Superficie: " + superficie;
    }
    
    public boolean equals(Ciudad otra)
    {
        return
            CP==otra.obtenerCP() &&
            poblacion==otra.obtenerPoblacion() &&
            superficie==otra.obtenerSuperficie();
    }
    
    public Ciudad clone()
    {
        return new Ciudad (CP, poblacion, superficie);
    }
}
