import IPOO.*;

public class Tester
{
  /*  public Tester()
    {
        
    }*/
    
    public static void main (String args[])
    {
       /* Tester t = new Tester();
        t.test();*/
        test();
    }
    
    public static void test()
    {
        System.out.print("Ingrese una palabra: ");
        String cadena = ES.leerCadena();
        while (!esPalabraValida(cadena)) {
            System.out.println("ERROR: la palabra ingresada debe contener solamente letras.");
            System.out.print("Ingrese nuevamente una palabra: ");
            cadena = ES.leerCadena();
        }
        
        /**
         * @todo: implementar casos de prueba significativos
         */
        System.out.println("----------------------Test esta letra-------------------------");
        
        Palabra p = new Palabra(cadena);
        
        boolean esta= p.estaLetra('c');
        
        System.out.println("El caracter c se encuentra en "+p+"?: "+esta);
        
        esta= p.estaLetra('a');
        
        System.out.println("El caracter a se encuentra en "+p+"?: "+esta);
        
        esta= p.estaLetra('z');
        
        System.out.println("El caracter z se encuentra en "+p+"?: "+esta);
        
        System.out.println("----------------------Test empieza-------------------------");
        
        Oracion o = new Oracion("introduccion a la programacion orientada a objetos");
        System.out.println("Oracion o: "+o.toString());
        
        int cant= o.empieza('o');
        
        System.out.println("En la oracion o hay "+cant+" palabras que comienzan con el caracter o");
        
        cant= o.empieza('i');
        
        System.out.println("En la oracion o hay "+cant+" palabras que comienzan con el caracter i");
        
        cant= o.empieza('z');
        
        System.out.println("En la oracion o hay "+cant+" palabras que comienzan con el caracter z");
        
        System.out.println("----------------------Test concatenacion-------------------------");
       
        Oracion o1 = o.concatenar(p);
         
        System.out.println("La nueva oracion o1 es: "+o1.toString());
         
        System.out.println("----------------------Test esta palabra-------------------------");
         
        boolean estap= o.estaPalabra(p);
         
        System.out.println("La palabra ingresada esta en o?: "+ estap);
        
        estap= o1.estaPalabra(p);
        
        System.out.println("La palabra ingresada esta en o1?: "+ estap);
         
        System.out.println("---------------------------------------------------------------"); 
        
    }
    
    //----------------------------------------------------------------------------------------------
    //---- Constructor -----------------------------------------------------------------------------
    //----------------------------------------------------------------------------------------------
    
    /**
     * Controla que un string dado represente una cadena valida, es decir, que contenga 
     * solo caracteres en el rango ['a'..'z'] y ['A'..'Z']
     */
    private static boolean esPalabraValida(String cadena)
    {
        boolean valida = true;
        for (int i = 0 ; i < cadena.length() && valida; i++) {
            char c = cadena.charAt(i);
            valida = (((int)c >= (int)'a') && ((int)c <= (int)'z')) ||
                     (((int)c >= (int)'A') && ((int)c <= (int)'Z'));
        }
        return valida;
    }
    
    /**
     * Controla que un string dado represente una oración valida, es decir, que contenga 
     * solo caracteres en el rango ['a'..'z'] y ['A'..'Z'] y espacios en blanco.
     * 
     * No debe contener el punto final, ya que es responsabilidad del constructor de clase Oracion
     * agregarlo
     */
    private static boolean esOracionValida(String cadena)
    {
        boolean valida = true;
        for (int i = 0 ; i < cadena.length() && valida; i++) {
            char c = cadena.charAt(i);
            valida = (((int)c >= (int)'a') && ((int)c <= (int)'z')) ||
                     (((int)c >= (int)'A') && ((int)c <= (int)'Z')) ||
                     (c == ' ');
        }
        return valida;
    }
}
