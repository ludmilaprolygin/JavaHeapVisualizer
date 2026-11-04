public class Tester
{
    public static void main (String[]args)
    {
        Ciudad ciu1, ciu2, ciu3, clon1, clon3;
        ciu1 = new Ciudad (20, 5400, 65485);
        ciu2 = new Ciudad (20, 5400, 65485);
        ciu3 = new Ciudad (20546, 5400, 65485);
        System.out.println("//--Inicio testeo--//");
        System.out.println();
        System.out.println("Estado interno ciu1: "+ciu1.toString());
        System.out.println();
        System.out.println("Estado interno ciu2: "+ciu2.toString());
        System.out.println();
        System.out.println("Estado interno ciu3: "+ciu3.toString());
        System.out.println();
        System.out.println("//----------Prueba equals----------//");
        System.out.println();
        System.out.println("¿ciu1.equals(ciu2)?: "+ciu1.equals(ciu2));
        System.out.println();
        System.out.println("¿ciu1.equals(ciu3)?: "+ciu1.equals(ciu3));
        System.out.println();
        System.out.println("//----------Prueba clone---------//");
        System.out.println();
        System.out.println("Clonando ciu1 en clon1 ...");
        System.out.println();
        clon1 = ciu1.clone();
        System.out.println("Clonando ciu3 en clon3 ...");
        System.out.println();
        clon3 = ciu3.clone();
        System.out.println("¿ciu1.equals(clon1)?: "+ciu1.equals(clon1));
        System.out.println();
        System.out.println("¿ciu1==clon1?: "+(ciu1==clon1));
        System.out.println();
        System.out.println("¿ciu3.equals(clon3)?: "+ciu3.equals(clon3));
        System.out.println();
        System.out.println("¿ciu3==clon3?: "+(ciu3==clon3));
        System.out.println();
        System.out.println("//---------Prueba copy---------//");
        System.out.println();
        System.out.println("Estado interno ciu1: "+ciu1.toString());
        System.out.println();
        System.out.println("Estado interno ciu3: "+ciu3.toString());
        System.out.println();
        System.out.println("Copiando en ciu1 el estado interno de ciu3 ...");
        System.out.println();
        ciu1.copy(ciu3);
        System.out.println("Estado interno ciu1 después del copy: "+ciu1.toString());
    }
}