//newmethod
package de.fhg.iais.roberta.syntax.action.nao;
import de.fhg.iais.roberta.syntax.action.Action;
import de.fhg.iais.roberta.transformer.forClass.NepoPhrase;
import de.fhg.iais.roberta.transformer.forField.NepoField;
import de.fhg.iais.roberta.util.ast.BlocklyProperties;
import de.fhg.iais.roberta.util.syntax.BlocklyConstants;

@NepoPhrase(name = "PICK_OBJ", category = "ACTOR", blocklyNames = {"naoActions_pickObject"})
public final class PickObj extends Action {
    @NepoField(name = "OBJECT",value = BlocklyConstants.TEXT)
    public final String objectName;

    public PickObj(BlocklyProperties properties, String objectName) {
        super(properties);
        this.objectName = objectName;
        setReadOnly();
    }
}