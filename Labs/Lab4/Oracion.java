public class Oracion
{
    //----------------------------------------------------------------------------------------------
    //---- Atributos de instancia ------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------
    
    private char[] S;

    //----------------------------------------------------------------------------------------------
    //---- Constructor -----------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------
    
    public Oracion(String s)
    {
        S = new char[s.length() + 1];
        for (int i = 0; i < s.length(); i++) {
            S[i] = s.charAt(i);
        }
        S[s.length()] = '.';
    }

    //----------------------------------------------------------------------------------------------
    //---- Consultas -------------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------
    
    public int longitud()
    {
        return S.length;
    }
    
    public char caracterEnPosicion(int i)
    {
        return S[i];
    }
    
    public String toString()
    {
        String salida = "";
        for (int i = 0; i < S.length; i++) {
            salida += S[i];
        }
        return salida;
    }
    
    /**---->@todo: encuentre el error en el metodo empieza o en su auxiliar.<----
       i = 0 contador = 0 mientras caracterEnPosicion(i) sea distinto de '.' si caracterEnPosicion(i) == ch 
       contador = contador + 1 i = consumirPalabra(i) 
       resultado = contador*/
       
    public int empieza(char c){
     int i=0;
     int contador=0;
     
     while(S[i]!='.'){
        
        if(S[i]==c)
              contador++;
        i=consumirPalabra(i);    }
        
        return contador;
    }
    /**
      j = i 
      mientras caracterEnPosicion(j) sea distinto de ' ' y '.'
      j = j + 1 // si corta el ciclo por ser ' ', se consume un lugar adicional
      si caracterEnPosicion(j) == ' ' j = j + 1 
      resultado = j 
       */
    private int consumirPalabra(int i) {
    int j=i;
    
    while((S[j]!=' ')&&(S[j]!='.'))
        j++;
        
    if(S[j]==' ')
      j++;
      
   return j;   
    }
    
    public Oracion concatenar(Palabra p)
    {
        String nueva = new String();
        for(int i=0; i<S.length - 1; i++)
        {
            nueva += S[i];
        }
        Oracion nuevaO = new Oracion(nueva+" "+p.toString());
        return nuevaO;
    }
    
    public boolean estaPalabra(Palabra p)
    {
        boolean esta = false;
        int i = 0;
        int j = 0;
        int pos;
        while(S[i]!='.' && !esta)
        {
            if(S[i]!=p.caracterEnPosicion(j))
            {
                pos = consumirPalabra(i);
                i=pos;
                j=0;
            }
            else
            {
                i++;
                j++;
                if(j==p.longitud()-1) esta=true;
            }
        }
        return esta;
    }
}
