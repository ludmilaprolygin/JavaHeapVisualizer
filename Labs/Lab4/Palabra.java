public class Palabra
{
    //----------------------------------------------------------------------------------------------
    //---- Atributos de instancia ------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------

    private char[] S;

    //----------------------------------------------------------------------------------------------
    //---- Constructor -----------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------
    
    public Palabra(String s)
    {
        S = new char[s.length()];
        for (int i = 0; i < s.length(); i++) {
            S[i] = s.charAt(i);
        }
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
    
    public boolean estaLetra(char c)
    {
        /* PLANTEO: Esta el caracter c en la palabra S
         * CB: Si la palabra es vacia, el no esta el caracter c en la palabra S
         * CR: Caso contrario, esta el caracter c en la palabra S si, el caracter c es igual a la ultima letra de la palabra
         *      S o, esta el caracter c en la palabra S', siendo S' igual a S sin su ultima letra        
           */
        
        return estaL(c, S.length-1);
    }
    
    private boolean estaL(char c, int p)
    {
        boolean esta;
        if(p==-1) esta = false;
        else
        {
            if(S[p]==c) esta=true;
            else
                esta = estaL(c, --p);
        }
        return esta;
    }
}
