//newmethod
package de.fhg.iais.roberta.syntax.action.nao;
import de.fhg.iais.roberta.syntax.action.Action;
import de.fhg.iais.roberta.transformer.forClass.NepoPhrase;
import de.fhg.iais.roberta.util.ast.BlocklyProperties;

@NepoPhrase(name = "GRASP", category = "ACTOR", blocklyNames = {"naoActions_grasp"})
public final class Grasp extends Action {

    public Grasp(BlocklyProperties properties) {
        super(properties);
        setReadOnly();
    }
}