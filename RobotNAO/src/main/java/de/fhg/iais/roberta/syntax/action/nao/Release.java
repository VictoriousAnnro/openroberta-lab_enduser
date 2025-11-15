//newmethod
package de.fhg.iais.roberta.syntax.action.nao;
import de.fhg.iais.roberta.syntax.action.Action;
import de.fhg.iais.roberta.transformer.forClass.NepoPhrase;
import de.fhg.iais.roberta.util.ast.BlocklyProperties;

@NepoPhrase(name = "RELEASE", category = "ACTOR", blocklyNames = {"naoActions_release"})
public final class Release extends Action {

    public Release(BlocklyProperties properties) {
        super(properties);
        setReadOnly();
    }
}